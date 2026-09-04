import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Self-registration with a personal email and a password.
 *
 * A colleague registers themselves; an administrator who recognises them
 * approves; they then sign in with what they chose. No codes to distribute, and
 * nothing for the administrator to relay.
 *
 * **Work addresses are refused on purpose.** A `@giz.de` address identifies a
 * named person *and* their employer, and ties a record of their daily movements
 * to both — which is precisely what turns a colleague's side project into
 * something the employer's data protection office must have a view on. Asking
 * for a personal address keeps the pilot outside that, and the optional
 * official name and department give an administrator enough to recognise
 * somebody without the database holding an employer identifier.
 *
 * Those two fields are optional and stay optional. A colleague who would rather
 * not say leaves them blank and is approved on the strength of their name.
 */

export interface RegistrationInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  /** Optional, so the administrator can recognise who is asking. */
  readonly officialName?: string;
  readonly department?: string;
}

export interface RegistrationResult {
  readonly ok: boolean;
  readonly message: string;
  /** True when a work address was used where a personal one was asked for. */
  readonly workAddress?: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * How many wrong passwords one account tolerates before the door stops
 * answering, and for how long.
 *
 * An eight-character password is fine against a person and worthless against a
 * script that may guess without limit — and the pilot is on a public URL that
 * anybody can reach. Ten attempts is more than a colleague misremembering their
 * own password ever needs, and fifteen minutes is short enough that being
 * locked out is an inconvenience rather than a support request.
 *
 * Counted per account rather than per address, deliberately. Counting by IP
 * would lock out a whole office behind one connection because somebody two
 * desks away mistyped, and would do nothing against guesses spread over a
 * botnet — the account is the thing being attacked, so the account is what is
 * defended.
 */
export const MAX_SIGNIN_ATTEMPTS = 10;
export const LOCKOUT_MINUTES = 15;

/** Domains that must NOT be used: employer addresses, by design. */
export const parseBlockedDomains = (raw: string | undefined): readonly string[] =>
  (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter((d) => d.length > 0);

export const isWorkAddress = (email: string, blocked: readonly string[]): boolean => {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1] ?? "";
  return blocked.some((d) => domain === d || domain.endsWith(`.${d}`));
};

const hash = (password: string, salt: string): string =>
  scryptSync(password, salt, 32).toString("hex");

export class Accounts {
  constructor(
    private readonly db: Db,
    private readonly blockedDomains: readonly string[],
    /**
     * The administrator's own address.
     *
     * Registering with it is approved immediately and as an admin. Somebody has
     * to be able to approve the first colleague, and an admin row seeded
     * without a password simply cannot sign in — which is exactly the lockout
     * an earlier version shipped.
     */
    private readonly adminEmail: string = "",
  ) {}

  register(input: RegistrationInput): RegistrationResult {
    const email = input.email.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, message: "That doesn't look like an email address." };
    }

    const isAdmin = this.adminEmail !== "" && email === this.adminEmail.trim().toLowerCase();

    // Refused loudly and with the reason, because a colleague reaching for
    // their work address is doing the natural thing and deserves to know why
    // it is the wrong one here.
    //
    // The administrator is NOT exempt. Exempting them would put an employer
    // address in the one row everybody sees, which is exactly the claim this
    // rule exists to keep true. An ADMIN_EMAIL on a blocked domain is a
    // configuration mistake, and the reply says so rather than leaving the
    // operator to guess.
    if (isWorkAddress(email, this.blockedDomains)) {
      return {
        ok: false,
        workAddress: true,
        message: isAdmin
          ? "ADMIN_EMAIL is set to a work address, which this server refuses to " +
            "store. Restart with a personal address as ADMIN_EMAIL."
          : "Please use a personal email address, not your work one. " +
            "Ekpothe is a colleague's own project, and keeping work addresses out " +
            "of it is deliberate — it means your employer's data is not involved.",
      };
    }

    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        message: `Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }
    if (!input.displayName.trim()) {
      return { ok: false, message: "Please tell colleagues what to call you." };
    }

    // One reply whether the address is new or already registered. Anything
    // else turns this form into a way of discovering who has signed up.
    const same: RegistrationResult = {
      ok: true,
      message:
        "Thanks — your registration is with the administrator. " +
        "You'll be able to sign in once it's approved.",
    };

    const existing = this.db.get<{ id: string }>("SELECT id FROM users WHERE email = ?", email);
    if (existing) return same;

    const adminWelcome: RegistrationResult = {
      ok: true,
      message: "You're the administrator — signed up and approved. Sign in now.",
    };

    const salt = randomBytes(16).toString("hex");
    this.db.run(
      `INSERT INTO users
         (id, displayName, email, status, role, passwordHash, passwordSalt,
          officialName, department, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      input.displayName.trim().slice(0, 80),
      email,
      isAdmin ? "approved" : "pending",
      isAdmin ? "admin" : "member",
      hash(input.password, salt),
      salt,
      input.officialName?.trim().slice(0, 120) || null,
      input.department?.trim().slice(0, 80) || null,
      new Date().toISOString(),
    );
    return isAdmin ? adminWelcome : same;
  }

  /**
   * Sign in. Returns the user id, or a reason that never distinguishes
   * "no such account" from "wrong password".
   */
  signIn(email: string, password: string, now: Date = new Date()): { userId: string } | { error: string } {
    const wrong = { error: "That email and password do not match." };
    const normalised = email.trim().toLowerCase();

    /*
      Held in memory on purpose.

      A restart clears it, which is the right trade: this is a brake on
      guessing, not a record of who failed to sign in, and a table of failed
      attempts is a small log of people's mistakes that would have to be
      protected, explained in the privacy notice, and eventually deleted. The
      brake is worth having; the log is not.
    */
    const failures = Accounts.failures.get(normalised);
    if (failures && failures.count >= MAX_SIGNIN_ATTEMPTS) {
      const until = failures.first + LOCKOUT_MINUTES * 60_000;
      if (now.getTime() < until) {
        const minutes = Math.max(1, Math.ceil((until - now.getTime()) / 60_000));
        return {
          error:
            `Too many sign-in attempts. Try again in ${minutes} ` +
            `${minutes === 1 ? "minute" : "minutes"}.`,
        };
      }
      Accounts.failures.delete(normalised);
    }
    const row = this.db.get<{
      id: string;
      status: string;
      isSuspended: number;
      passwordHash: string | null;
      passwordSalt: string | null;
    }>(
      "SELECT id, status, isSuspended, passwordHash, passwordSalt FROM users WHERE email = ?",
      email.trim().toLowerCase(),
    );

    if (!row?.passwordHash || !row.passwordSalt) return this.countFailure(normalised, now, wrong);

    const given = Buffer.from(hash(password, row.passwordSalt), "hex");
    const want = Buffer.from(row.passwordHash, "hex");
    // Compared even when the outcome is already decided, so a wrong password
    // and an unapproved account take the same time to answer.
    const matches = given.length === want.length && timingSafeEqual(given, want);
    if (!matches) return this.countFailure(normalised, now, wrong);

    // A correct password clears the count. Somebody who mistyped nine times and
    // then got it right is not mid-attack.
    Accounts.failures.delete(normalised);

    if (row.isSuspended) return { error: "This account has been suspended." };
    if (row.status !== "approved") {
      return {
        error:
          "Your registration is still waiting for approval. " +
          "You'll be able to sign in once the administrator has approved it.",
      };
    }
    return { userId: row.id };
  }

  /** Everything an administrator needs to recognise who is asking. */
  /** Attempts per account: count, and when this window opened. */
  private static readonly failures = new Map<string, { count: number; first: number }>();

  private countFailure<T>(email: string, now: Date, reply: T): T {
    const existing = Accounts.failures.get(email);
    // A window that has already expired starts again rather than accumulating,
    // so one wrong password a month never adds up to a lockout.
    if (!existing || now.getTime() - existing.first > LOCKOUT_MINUTES * 60_000) {
      Accounts.failures.set(email, { count: 1, first: now.getTime() });
    } else {
      existing.count += 1;
    }
    return reply;
  }

  /** Test seam: the counter is process-wide, so tests must be able to clear it. */
  static resetAttempts(): void {
    Accounts.failures.clear();
  }

  pending(): readonly {
    id: string;
    displayName: string;
    email: string;
    officialName: string | null;
    department: string | null;
    createdAt: string;
  }[] {
    return this.db.all(
      `SELECT id, displayName, email, officialName, department, createdAt
         FROM users WHERE status = 'pending' ORDER BY createdAt`,
    );
  }
}
