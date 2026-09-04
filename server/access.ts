import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Who is allowed in.
 *
 * The pilot is deliberately reachable by anyone — a public URL a colleague can
 * open on their phone without going through IT. What is *not* public is access.
 *
 * Two ways through, depending on whether the server can send email.
 *
 * **With email (automatic).** The address must be on an allowed work domain,
 * and the code is sent to that address. Receiving it proves the mailbox belongs
 * to whoever asked, so no administrator is needed. This is the important part:
 * on its own, a domain check is a *claim*, not a proof — anyone can type
 * `someone@giz.de`. Sending the code to the address is what makes automatic
 * approval safe rather than merely convenient.
 *
 * **Without email (manual).** The request waits for an administrator who
 * recognises the name, and the code is relayed by hand. Slower, and it does not
 * scale past a few dozen people, but it is a person deciding about a person.
 *
 * Either way a code is single-use, bound to one address, and expires — so a
 * forwarded code is worthless.
 */

export type AccessStatus = "pending" | "approved" | "suspended";

export interface AccessRequestResult {
  readonly ok: boolean;
  /** Shown to the person who asked. Never says whether an account exists. */
  readonly message: string;
  /** True when the address is outside every allowed organisation. */
  readonly outsideOrganisation?: boolean;
}

/**
 * The reply to an address outside every allowed organisation.
 *
 * The organisation's own wording. It says this is a scope decision rather than
 * a fault, and leaves a door open — which matters, because the person reading
 * it may well be a partner-organisation colleague who genuinely shares the
 * commute.
 */
export const NOT_IN_ORGANISATION =
  "Sorry! You are not in our organisation. " +
  "Please wait until your organisation is listed, or contact the admin.";

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

/**
 * How colleagues get in.
 *
 * `invite`  — the pilot default. No email address is asked for or stored. The
 *             administrator generates codes and hands them to colleagues
 *             directly, and a colleague signs in with a code and a display name
 *             of their choosing.
 *
 * `domain`  — an email address on an allowed work domain, approved either by
 *             the administrator or automatically when the code can be emailed.
 *
 * `invite` exists because collecting employer email addresses is the single
 * thing that most changes this from a colleague's side project into something
 * an employer's data protection office has to have a view on. An address like
 * `nusrat@giz.de` identifies a named person *and* their employer, and ties a
 * record of their daily movements to both.
 *
 * Without it the database holds a display name somebody chose and the journeys
 * they published. That is a much smaller thing to be responsible for, and it is
 * enough to find out whether colleagues will use a carpool at all — which is
 * the only question a pilot needs to answer.
 *
 * It is also the stronger gate. A code handed over in person is better evidence
 * than an unverified claim to own an address at a given domain.
 */
export type AccessMode = "invite" | "domain";

/**
 * What approving somebody actually produced.
 *
 * `code` — the colleague has no password yet (they were invited), so a
 *          single-use code is minted for them to redeem.
 * `password` — they registered themselves and already chose a password.
 *          Approval is the whole action; issuing a code as well would hand
 *          them a second credential and point them at the wrong door.
 */
export type ApprovalResult =
  | { readonly kind: "code"; readonly code: string }
  | { readonly kind: "password" };

export interface AccessOptions {
  readonly mode: AccessMode;
  /** Domains that may request access at all. */
  readonly allowedDomains: readonly string[];
  /**
   * Domains approved without an administrator, **when a code can be emailed**.
   *
   * Never honoured without a working mailer: automatic approval on an
   * unverified address would admit anybody who knows the domain.
   */
  readonly autoApproveDomains: readonly string[];
  readonly canSendEmail: boolean;
  readonly ipPepper: string;
}

export class Access {
  private readonly allowedDomains: readonly string[];
  private readonly autoApproveDomains: readonly string[];
  private readonly canSendEmail: boolean;
  private readonly ipPepper: string;

  readonly mode: AccessMode;

  constructor(
    private readonly db: Db,
    options: AccessOptions,
  ) {
    this.mode = options.mode;
    this.allowedDomains = options.allowedDomains;
    this.autoApproveDomains = options.autoApproveDomains;
    this.canSendEmail = options.canSendEmail;
    this.ipPepper = options.ipPepper;
  }

  /**
   * May this address skip the administrator?
   *
   * Only when a code can actually be emailed to it. Without that, the address
   * is unverified and the domain proves nothing.
   */
  autoApproves(email: string): boolean {
    return (
      this.mode === "domain" &&
      this.canSendEmail &&
      emailIsAllowed(email, this.autoApproveDomains)
    );
  }

  /**
   * Mint a code for somebody the administrator is about to invite.
   *
   * No email, no request, no queue. The administrator types a name they
   * recognise, gets a code, and passes it on however they normally talk to that
   * colleague. The placeholder address exists only to satisfy the unique index
   * and is never shown, never emailed, and never treated as contactable.
   */
  invite(displayName: string, adminId: string): { code: string; userId: string } {
    const userId = randomUUID();
    this.db.run(
      `INSERT INTO users (id, displayName, email, status, createdAt)
       VALUES (?, ?, ?, 'pending', ?)`,
      userId,
      displayName.trim().slice(0, 80) || "Colleague",
      `invite:${userId}`,
      new Date().toISOString(),
    );
    const issued = this.approve(userId, adminId);
    // The row was just inserted with no password, so approve always mints a
    // code here. Asserting it rather than assuming keeps the invariant local.
    if (issued?.kind !== "code") throw new Error("invite: expected a code");
    return { code: issued.code, userId };
  }

  /**
   * Redeem a code without an email address.
   *
   * Used in invite mode: the code alone identifies the row, because it was
   * minted for exactly one person. A colleague may set the display name they
   * want to be known by at the same time.
   */
  redeemByCode(code: string, displayName?: string): string | undefined {
    const rows = this.db.all<{ id: string; userId: string; codeHash: string; salt: string; expiresAt: string }>(
      `SELECT c.id, c.userId, c.codeHash, c.salt, c.expiresAt
         FROM invite_codes c JOIN users u ON u.id = c.userId
        WHERE c.usedAt IS NULL AND u.status = 'approved'`,
    );
    const now = new Date().toISOString();
    for (const row of rows) {
      if (row.expiresAt < now) continue;
      const given = Buffer.from(hashCode(code, row.salt), "hex");
      const want = Buffer.from(row.codeHash, "hex");
      if (given.length === want.length && timingSafeEqual(given, want)) {
        this.db.run("UPDATE invite_codes SET usedAt = ? WHERE id = ?", now, row.id);
        if (displayName?.trim()) {
          this.db.run(
            "UPDATE users SET displayName = ? WHERE id = ?",
            displayName.trim().slice(0, 80),
            row.userId,
          );
        }
        this.db.audit(row.userId, "user", row.userId, "redeem-code");
        return row.userId;
      }
    }
    return undefined;
  }

  /**
   * A colleague asks for access.
   *
   * The reply is the same whether the request was accepted, was a duplicate, or
   * named somebody already approved. Anything else turns this form into a way
   * of discovering who works here.
   */
  request(
    email: string,
    displayName: string,
    ip: string,
  ): AccessRequestResult & { readonly userId?: string; readonly code?: string } {
    const normalised = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) {
      return { ok: false, message: "That doesn't look like an email address." };
    }

    // Refused with the organisation's own wording, so a colleague from a
    // partner organisation understands this is a scope decision rather than a
    // fault, and knows what to do about it.
    if (!emailIsAllowed(normalised, this.allowedDomains)) {
      return { ok: false, message: NOT_IN_ORGANISATION, outsideOrganisation: true };
    }

    const same: AccessRequestResult = {
      ok: true,
      message:
        "Thanks — your request has gone to the administrator. " +
        "You'll be sent a code once it's approved.",
    };

    if (this.tooManyRecently(ip)) return same;
    this.recordAttempt(ip);

    const existing = this.db.get<{ id: string; status: string }>(
      "SELECT id, status FROM users WHERE email = ?",
      normalised,
    );

    // Somebody already approved asking again is not an error: they have lost
    // their code. Issue a fresh one, which invalidates the old, and say the
    // same thing as always so the form still cannot be used to find out who
    // works here.
    if (existing) {
      if (this.autoApproves(normalised)) {
        const issued = this.approve(existing.id, "system");
        return { ...this.emailedMessage(), userId: existing.id, ...(issued?.kind === "code" ? { code: issued.code } : {}) };
      }
      return same;
    }

    const userId = randomUUID();
    this.db.run(
      `INSERT INTO users (id, displayName, email, status, createdAt)
       VALUES (?, ?, ?, 'pending', ?)`,
      userId,
      displayName.trim().slice(0, 80) || normalised.split("@")[0],
      normalised,
      new Date().toISOString(),
    );

    if (this.autoApproves(normalised)) {
      const issued = this.approve(userId, "system");
      return { ...this.emailedMessage(), userId, ...(issued?.kind === "code" ? { code: issued.code } : {}) };
    }
    return { ...same, userId };
  }

  private emailedMessage(): AccessRequestResult {
    return {
      ok: true,
      message:
        "Welcome — we've emailed your code to your work address. " +
        "It works once and expires in seven days.",
    };
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
  approve(userId: string, adminId: string): ApprovalResult | undefined {
    const user = this.db.get<{ id: string; passwordHash: string | null }>(
      "SELECT id, passwordHash FROM users WHERE id = ?",
      userId,
    );
    if (!user) return undefined;

    const now0 = new Date();
    // A colleague who registered themselves already chose a password. Minting
    // a code for them would hand out a second credential nobody asked for and
    // tell them to sign in with the wrong one. Approval is the whole action.
    if (user.passwordHash) {
      this.db.run(
        "UPDATE users SET status = 'approved', approvedBy = ?, approvedAt = ? WHERE id = ?",
        adminId,
        now0.toISOString(),
        userId,
      );
      this.db.audit(adminId, "user", userId, "approve");
      return { kind: "password" };
    }

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
    return { kind: "code", code };
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
