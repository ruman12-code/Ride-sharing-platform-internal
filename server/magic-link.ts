import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Signing in, without a password.
 *
 * A colleague types their address and taps the link that arrives. That is the
 * entire mechanism, and it is deliberately the *only* one.
 *
 * The reasoning is worth stating, because "add a password" is the reflex.
 * A password on a pilot like this is a thing to invent, a thing to forget, and
 * therefore a reset flow to build — a reset flow which is itself a link emailed
 * to the address on file. So the password sits in front of an email link that
 * has to exist anyway, and its only lasting contribution is the colleague who
 * cannot get in on Monday morning. Removing it is less code and fewer ways to
 * be stuck.
 *
 * It costs one thing, and it should be said plainly: **email becomes load
 * bearing**. If mail stops, nobody new can sign in. Two things keep that from
 * being a crisis. Approval already depends on mail, so this adds no dependency
 * that was not already there; and sessions roll for ninety days on every visit,
 * so a colleague who is already using the app is unaffected by an outage.
 *
 * Shape of the token: `<row id>.<secret>`. The id finds the row in one indexed
 * lookup; the secret is compared against a salted hash in constant time. The
 * database never holds anything that can be used to sign in.
 *
 * Both halves are kept short deliberately. Plain-text mail is wrapped at 76
 * columns, so a long URL is delivered split across lines with soft breaks
 * inside it. Compliant clients reassemble it, but the failure when one does not
 * — or when somebody copies the link by hand out of a preview — is a colleague
 * who cannot sign in and has no idea why. A 35-character token keeps the whole
 * URL on one line, where nothing has to reassemble anything.
 *
 * That costs no security worth having. The id only needs to be unique among
 * live rows; the secret is 128 bits, on a token that is single-use, bound to
 * one account, and dead in twenty minutes.
 */

/**
 * Twenty minutes.
 *
 * Long enough to walk from a desk to a phone and open the right inbox, short
 * enough that a link forwarded or left in a shared mailbox is worthless by the
 * time anybody else reads it.
 */
export const LINK_VALID_MINUTES = 20;

/**
 * Links one account may ask for in an hour.
 *
 * Not a security boundary — the token is what protects the account — but a
 * courtesy to the person whose inbox it is. Somebody impatiently tapping "send
 * again" should not be able to post twenty messages to a colleague's address.
 */
export const MAX_LINKS_PER_HOUR = 5;

const hashSecret = (secret: string, salt: string): string =>
  scryptSync(secret, salt, 32).toString("hex");

export interface LinkRequestOutcome {
  readonly token: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
}

export class MagicLinks {
  constructor(private readonly db: Db) {}

  /**
   * Mint a sign-in link, or decline silently.
   *
   * Returns `undefined` for an address with no account, one still waiting for
   * approval, one that has been suspended, and one that has asked too often.
   * The caller says exactly the same thing to the browser in every case,
   * including success — otherwise this form becomes a way to find out who works
   * here and who has signed up.
   */
  request(email: string, now: Date = new Date()): LinkRequestOutcome | undefined {
    const normalised = email.trim().toLowerCase();
    const user = this.db.get<{
      id: string;
      email: string;
      displayName: string;
      status: string;
      isSuspended: number;
    }>(
      "SELECT id, email, displayName, status, isSuspended FROM users WHERE email = ?",
      normalised,
    );
    if (!user || user.isSuspended || user.status !== "approved") return undefined;

    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    const recent = this.db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM login_links WHERE userId = ? AND createdAt > ?",
      user.id,
      hourAgo,
    );
    if ((recent?.n ?? 0) >= MAX_LINKS_PER_HOUR) return undefined;

    // Asking for a new link retires the old ones. Two live links to one account
    // is one more than anybody needs, and the older one is usually the one
    // sitting in an inbox somebody else can reach.
    this.db.run(
      "UPDATE login_links SET usedAt = ? WHERE userId = ? AND usedAt IS NULL",
      now.toISOString(),
      user.id,
    );

    const id = randomBytes(9).toString("base64url"); // 12 chars
    const secret = randomBytes(16).toString("base64url"); // 22 chars, 128 bits
    const salt = randomBytes(16).toString("hex");
    this.db.run(
      `INSERT INTO login_links (id, userId, tokenHash, salt, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      hashSecret(secret, salt),
      salt,
      now.toISOString(),
      new Date(now.getTime() + LINK_VALID_MINUTES * 60_000).toISOString(),
    );

    return { token: `${id}.${secret}`, userId: user.id, email: user.email, displayName: user.displayName };
  }

  /**
   * Redeem a link. Returns the user id, once.
   *
   * Consumed on use, so a link that has been tapped — or that a mail scanner
   * followed — cannot be tapped again.
   */
  redeem(token: string, now: Date = new Date()): string | undefined {
    const [id = "", secret = ""] = token.trim().split(".");
    if (!id || !secret) return undefined;

    const row = this.db.get<{
      userId: string;
      tokenHash: string;
      salt: string;
      expiresAt: string;
      usedAt: string | null;
    }>("SELECT userId, tokenHash, salt, expiresAt, usedAt FROM login_links WHERE id = ?", id);
    if (!row || row.usedAt || row.expiresAt < now.toISOString()) return undefined;

    const given = Buffer.from(hashSecret(secret, row.salt), "hex");
    const want = Buffer.from(row.tokenHash, "hex");
    if (given.length !== want.length || !timingSafeEqual(given, want)) return undefined;

    // Re-check the account at the moment of redemption, not only when the link
    // was minted. Somebody suspended in the twenty minutes since must not be
    // let in by a link that was valid when it was sent.
    const user = this.db.get<{ status: string; isSuspended: number }>(
      "SELECT status, isSuspended FROM users WHERE id = ?",
      row.userId,
    );
    if (!user || user.isSuspended || user.status !== "approved") return undefined;

    this.db.run("UPDATE login_links SET usedAt = ? WHERE id = ?", now.toISOString(), id);
    this.db.audit(row.userId, "user", row.userId, "sign-in-link");
    return row.userId;
  }
}
