import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Who is allowed in.
 *
 * The pilot is deliberately reachable by anyone — a public URL a colleague can
 * open on their phone without going through IT. What is *not* public is access.
 *
 * A colleague registers themselves, an administrator who recognises them
 * approves, and from then on they sign in by tapping a link emailed to the
 * address they gave (`magic-link.ts`). This class is the administrator's half
 * of that: approving, suspending, and the one remaining code path.
 *
 * **Invite codes** survive for the colleague a link cannot reach — no usable
 * personal address, or a shared device. The administrator types a name they
 * recognise, gets a code, and hands it over however they normally talk to that
 * person. The row carries an `invite:` placeholder address precisely because
 * nothing can be sent to it.
 *
 * An earlier version also had a third way in: request access with a work
 * address on an allowed domain and receive a code by email. It is gone. It did
 * exactly what a sign-in link does — prove you can read that mailbox — with
 * more moving parts, it needed a list of allowed employer domains this pilot
 * deliberately no longer keeps, and no screen in the app ever called it. Three
 * doors, two of them unused, is how the administrator got locked out of their
 * own pilot once already.
 */

export type AccessStatus = "pending" | "approved" | "suspended";

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
/**
 * What approving somebody actually produced.
 *
 * `code` — an invited row, which carries a placeholder address nothing can be
 *          sent to. A single-use code is minted and handed over in person.
 * `link` — they registered themselves with a real address, so approval is the
 *          whole action: from here they sign in by tapping an emailed link.
 *          Minting a code as well would hand them a second credential and
 *          point them at a door that no longer exists.
 */
export type ApprovalResult =
  | { readonly kind: "code"; readonly code: string }
  | { readonly kind: "link" };

export class Access {
  constructor(private readonly db: Db) {}

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
    const user = this.db.get<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE id = ?",
      userId,
    );
    if (!user) return undefined;

    const now0 = new Date();
    // A colleague who registered themselves gave a real address, so a link can
    // reach them and approval is the whole action. Only an invited row — whose
    // "address" is the `invite:` placeholder that exists to satisfy the unique
    // index and can receive nothing — needs a code.
    if (!user.email.startsWith("invite:")) {
      this.db.run(
        "UPDATE users SET status = 'approved', approvedBy = ?, approvedAt = ? WHERE id = ?",
        adminId,
        now0.toISOString(),
        userId,
      );
      this.db.audit(adminId, "user", userId, "approve");
      return { kind: "link" };
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
}
