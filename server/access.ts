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
 * Approving somebody always mints a code, whether or not mail can reach them.
 *
 * It used to mint one only for an invited row, on the reasoning that anybody
 * who gave a real address could be sent a link instead. That reasoning held
 * right up until email stopped being available: free hosts block outbound SMTP,
 * and transactional providers gate their free tiers behind phone checks,
 * domains, and suspensions — none of which an administrator can do anything
 * about at eight in the morning with colleagues waiting.
 *
 * A code needs nobody's servers. The administrator reads it off the screen and
 * passes it on however they already talk to that colleague. When mail does
 * work, a link goes out as well and the code simply goes unused; it is
 * single-use and expires in a week either way.
 */
export type ApprovalResult = { readonly kind: "code"; readonly code: string };

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
  async invite(displayName: string, adminId: string): Promise<{ code: string; userId: string }> {
    const userId = randomUUID();
    await this.db.run(
      `INSERT INTO users (id, displayName, email, status, createdAt)
       VALUES (?, ?, ?, 'pending', ?)`,
      userId,
      displayName.trim().slice(0, 80) || "Colleague",
      `invite:${userId}`,
      new Date().toISOString(),
    );
    const issued = await this.approve(userId, adminId);
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
  async redeemByCode(code: string, displayName?: string): Promise<string | undefined> {
    const rows = await this.db.all<{ id: string; userId: string; codeHash: string; salt: string; expiresAt: string }>(
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
        await this.db.run("UPDATE invite_codes SET usedAt = ? WHERE id = ?", now, row.id);
        if (displayName?.trim()) {
          await this.db.run(
            "UPDATE users SET displayName = ? WHERE id = ?",
            displayName.trim().slice(0, 80),
            row.userId,
          );
        }
        await this.db.audit(row.userId, "user", row.userId, "redeem-code");
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
  async pending(): Promise<readonly { id: string; displayName: string; email: string; createdAt: string }[]> {
    return await this.db.all(
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
  async approve(userId: string, adminId: string): Promise<ApprovalResult | undefined> {
    const user = await this.db.get<{ id: string }>("SELECT id FROM users WHERE id = ?", userId);
    if (!user) return undefined;

    const now = new Date();
    await this.db.run(
      "UPDATE users SET status = 'approved', approvedBy = ?, approvedAt = ? WHERE id = ?",
      adminId,
      now.toISOString(),
      userId,
    );
    const code = await this.mint(userId, now);
    await this.db.audit(adminId, "user", userId, "approve");
    return { kind: "code", code };
  }

  /**
   * Issue a fresh code to somebody who is already in.
   *
   * This is the way back for a colleague who has lost their access rather than
   * their approval, and until it existed there was none. A code is single-use;
   * a session lasts ninety days. So a colleague who cleared their browser,
   * changed phone, or simply waited out the ninety days had spent their one
   * code, and the other door — a link sent to their address — needs a mail
   * provider this pilot has repeatedly not had. The honest description of that
   * state is that every colleague was on a ninety-day fuse, and the app would
   * have started stranding people one at a time with nothing in the interface
   * to do about it.
   *
   * Deliberately not `approve()` again. Re-approving would rewrite `approvedBy`
   * and `approvedAt`, so the record of who vouched for this colleague and when
   * would be replaced every time they lost their phone — and that record is the
   * only thing standing behind the claim that somebody recognised them.
   *
   * Refused for anybody not currently approved. A pending colleague is approved
   * instead, which is a decision rather than a reissue; a suspended one must not
   * be handed a working code by a button labelled as a convenience.
   */
  async reissue(userId: string, adminId: string): Promise<{ code: string } | undefined> {
    const user = await this.db.get<{ id: string; status: string; isSuspended: number }>(
      "SELECT id, status, isSuspended FROM users WHERE id = ?",
      userId,
    );
    if (!user || user.status !== "approved" || Number(user.isSuspended) === 1) return undefined;

    const code = await this.mint(userId, new Date());
    await this.db.audit(adminId, "user", userId, "reissue-code");
    return { code };
  }

  /**
   * Store one code for one person, and retire whatever came before it.
   *
   * Shared by approval, invitation and reissue so that the retiring cannot be
   * forgotten in one of them: two live codes for one colleague means a code
   * passed on last week still opens the door after a new one was issued, which
   * is exactly what reissuing is for undoing.
   *
   * Only the hash is stored. The plaintext is returned once, to be read off the
   * administrator's screen, and is not recoverable afterwards — so a copy of
   * this database hands nobody a working code.
   */
  private async mint(userId: string, now: Date): Promise<string> {
    const code = generateCode();
    const salt = randomBytes(16).toString("hex");
    await this.db.run(
      "UPDATE invite_codes SET usedAt = ? WHERE userId = ? AND usedAt IS NULL",
      now.toISOString(),
      userId,
    );
    await this.db.run(
      `INSERT INTO invite_codes (id, userId, codeHash, salt, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      userId,
      hashCode(code, salt),
      salt,
      now.toISOString(),
      new Date(now.getTime() + CODE_VALID_DAYS * 24 * 3_600_000).toISOString(),
    );
    return code;
  }

  async suspend(userId: string, adminId: string): Promise<void> {
    // Both columns. `status` is what the doors check and `isSuspended` is what
    // the booking rules check; setting only one leaves somebody who cannot sign
    // in but whose bookings the domain still treats as a colleague in good
    // standing, which is a state nobody would think to look for.
    await this.db.run("UPDATE users SET status = 'suspended', isSuspended = 1 WHERE id = ?", userId);
    // Ending access must end it now, not at the next sign-in.
    await this.db.run("DELETE FROM sessions WHERE userId = ?", userId);
    // Any live sign-in link is dead too, or a mail sent a minute ago is a way
    // back in for somebody who has just been removed.
    await this.db.run("UPDATE login_links SET usedAt = ? WHERE userId = ? AND usedAt IS NULL",
      new Date().toISOString(), userId);
    await this.db.audit(adminId, "user", userId, "suspend");
  }
}
