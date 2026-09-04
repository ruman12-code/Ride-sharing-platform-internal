import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";

/**
 * Self-registration with a personal email. No password.
 *
 * A colleague registers themselves; an administrator who recognises them
 * approves; from then on they sign in by tapping a link sent to that address
 * (see `magic-link.ts`). No codes to distribute, nothing for the administrator
 * to relay, and nothing for a colleague to forget.
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

export class Accounts {
  constructor(
    private readonly db: Db,
    private readonly blockedDomains: readonly string[],
    /**
     * The administrator's own address.
     *
     * Registering with it is approved immediately and as an admin. Somebody
     * has to be able to approve the first colleague, and a seeded admin row is
     * how an earlier version locked the administrator out of their own pilot.
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

    this.db.run(
      `INSERT INTO users
         (id, displayName, email, status, role,
          officialName, department, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      input.displayName.trim().slice(0, 80),
      email,
      isAdmin ? "approved" : "pending",
      isAdmin ? "admin" : "member",
      input.officialName?.trim().slice(0, 120) || null,
      input.department?.trim().slice(0, 80) || null,
      new Date().toISOString(),
    );
    return isAdmin ? adminWelcome : same;
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
