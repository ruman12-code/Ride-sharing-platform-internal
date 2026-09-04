import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Who is allowed in.
 *
 * The pilot is deliberately reachable by anyone — a public URL a colleague can
 * open on their phone without going through IT. What is *not* public is
 * access. Three gates stand between finding the URL and using the app:
 *
 *   1. The email must be on an allowed work domain. A gmail address is refused
 *      at the door, so a colleague's brother never reaches the queue.
 *   2. An administrator who recognises the name approves the request. This is
 *      the gate that actually matters: a person deciding about a person.
 *   3. A single-use code, issued to that one colleague and consumed on first
 *      use, binds the session to them.
 *
 * The third gate is what a shared passphrase could never provide. A passphrase
 * proves somebody knows a secret; a code issued to one email and usable once
 * proves it is that colleague.
 */

export type AccessStatus = "pending" | "approved" | "suspended";

export interface AccessRequestResult {
  readonly ok: boolean;
  /** Shown to the person who asked. Never says whether an account exists. */
  readonly message: string;
}

/** Work domains whose addresses may request access. */
export const parseAllowedDomains = (raw: string | undefined): readonly string[] =>
  (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter((d) => d.length > 0);

export const emailIsAllowed = (email: string, domains: readonly string[]): boolean => {
  // Exactly one "@", with something either side.
  //
  // An earlier version took everything after the *last* "@", so
  // "a@@example.org" read as the domain "example.org" and passed. The request
  // form happens to reject that shape before it gets here, but a gate that is
  // only correct because of its caller is not a gate.
  const parts = email.trim().split("@");
  if (parts.length !== 2) return false;
  const [local = "", domainPart = ""] = parts;
  if (local.length === 0 || domainPart.length === 0) return false;

  const domain = domainPart.toLowerCase();
  // Exact match or a subdomain of an allowed domain. Never a suffix match:
  // "notexample.org" must not pass because it ends in "example.org".
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1, easy to read aloud

/**
 * A code a colleague can be told over the phone or pasted into a chat.
 *
 * Six characters from a 32-symbol alphabet is about 30 bits. That is weak for
 * a password and ample here, because a code is single-use, expires in seven
 * days, is bound to one email address, and is only ever issued to somebody an
 * administrator has already approved by name.
 */
export const generateCode = (): string => {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
};

const hashCode = (code: string, salt: string): string =>
  scryptSync(code.trim().toUpperCase(), salt, 32).toString("hex");

export const CODE_VALID_DAYS = 7;
/** Requests allowed from one address in an hour, before the form stops replying. */
export const MAX_REQUESTS_PER_HOUR = 5;

/** Addresses are hashed before storage: rate limiting needs no IP history. */
const hashIp = (ip: string, pepper: string): string =>
  createHash("sha256").update(`${pepper}:${ip}`).digest("hex");

export class Access {
  constructor(
    private readonly db: Db,
    private readonly allowedDomains: readonly string[],
    private readonly ipPepper: string,
  ) {}

  /**
   * A colleague asks for access.
   *
   * The reply is the same whether the request was accepted, was a duplicate, or
   * named somebody already approved. Anything else turns this form into a way
   * of discovering who works here.
   */
  request(email: string, displayName: string, ip: string): AccessRequestResult {
    const same = {
      ok: true,
      message:
        "Thanks — your request has gone to the administrator. " +
        "You'll be sent a code once it's approved.",
    };

    const normalised = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) {
      return { ok: false, message: "That doesn't look like an email address." };
    }

    // Refused loudly, because a colleague who typed a personal address needs to
    // know why rather than waiting for an approval that will never come.
    if (!emailIsAllowed(normalised, this.allowedDomains)) {
      return {
        ok: false,
        message: `Please use your work email address (${this.allowedDomains
          .map((d) => `@${d}`)
          .join(" or ")}).`,
      };
    }

    if (this.tooManyRecently(ip)) return same;
    this.recordAttempt(ip);

    const existing = this.db.get<{ id: string }>(
      "SELECT id FROM users WHERE email = ?",
      normalised,
    );
    if (existing) return same;

    this.db.run(
      `INSERT INTO users (id, displayName, email, status, createdAt)
       VALUES (?, ?, ?, 'pending', ?)`,
      randomUUID(),
      displayName.trim().slice(0, 80) || normalised.split("@")[0],
      normalised,
      new Date().toISOString(),
    );
    return same;
  }

  private tooManyRecently(ip: string): boolean {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const row = this.db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM request_attempts WHERE ipHash = ? AND at > ?",
      hashIp(ip, this.ipPepper),
      since,
    );
    return (row?.n ?? 0) >= MAX_REQUESTS_PER_HOUR;
  }

  private recordAttempt(ip: string): void {
    this.db.run(
      "INSERT INTO request_attempts (id, ipHash, at) VALUES (?, ?, ?)",
      randomUUID(),
      hashIp(ip, this.ipPepper),
      new Date().toISOString(),
    );
    // Keep only what the window needs. An attempt log is not an access log.
    this.db.run(
      "DELETE FROM request_attempts WHERE at < ?",
      new Date(Date.now() - 24 * 3_600_000).toISOString(),
    );
  }

  pending(): readonly { id: string; displayName: string; email: string; createdAt: string }[] {
    return this.db.all(
      "SELECT id, displayName, email, createdAt FROM users WHERE status = 'pending' ORDER BY createdAt",
    );
  }

  /**
   * Approve a colleague and issue their code.
   *
   * The plaintext code is returned **once**, here, for the administrator to
   * pass on. Only its hash is stored, so it cannot be recovered later and a
   * copy of the database does not hand anybody a working code.
   */
  approve(userId: string, adminId: string): { code: string } | undefined {
    const user = this.db.get<{ id: string }>("SELECT id FROM users WHERE id = ?", userId);
    if (!user) return undefined;

    const code = generateCode();
    const salt = randomBytes(16).toString("hex");
    const now = new Date();

    this.db.run(
      "UPDATE users SET status = 'approved', approvedBy = ?, approvedAt = ? WHERE id = ?",
      adminId,
      now.toISOString(),
      userId,
    );
    // Any earlier unused code stops working: re-approving should not leave two
    // valid ways in.
    this.db.run("UPDATE invite_codes SET usedAt = ? WHERE userId = ? AND usedAt IS NULL", now.toISOString(), userId);
    this.db.run(
      `INSERT INTO invite_codes (id, userId, codeHash, salt, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      userId,
      hashCode(code, salt),
      salt,
      now.toISOString(),
      new Date(now.getTime() + CODE_VALID_DAYS * 24 * 3_600_000).toISOString(),
    );
    this.db.audit(adminId, "user", userId, "approve");
    return { code };
  }

  suspend(userId: string, adminId: string): void {
    this.db.run("UPDATE users SET status = 'suspended' WHERE id = ?", userId);
    // Ending access must end it now, not at the next login.
    this.db.run("DELETE FROM sessions WHERE userId = ?", userId);
    this.db.audit(adminId, "user", userId, "suspend");
  }

  /**
   * Redeem a code. Returns the user id on success.
   *
   * Compared in constant time, and consumed on use.
   */
  redeem(email: string, code: string): string | undefined {
    const normalised = email.trim().toLowerCase();
    const user = this.db.get<{ id: string; status: string }>(
      "SELECT id, status FROM users WHERE email = ?",
      normalised,
    );
    if (!user || user.status !== "approved") return undefined;

    const rows = this.db.all<{ id: string; codeHash: string; salt: string; expiresAt: string }>(
      "SELECT id, codeHash, salt, expiresAt FROM invite_codes WHERE userId = ? AND usedAt IS NULL",
      user.id,
    );
    const now = new Date().toISOString();
    for (const row of rows) {
      if (row.expiresAt < now) continue;
      const given = Buffer.from(hashCode(code, row.salt), "hex");
      const want = Buffer.from(row.codeHash, "hex");
      if (given.length === want.length && timingSafeEqual(given, want)) {
        this.db.run("UPDATE invite_codes SET usedAt = ? WHERE id = ?", now, row.id);
        this.db.audit(user.id, "user", user.id, "redeem-code");
        return user.id;
      }
    }
    return undefined;
  }
}
