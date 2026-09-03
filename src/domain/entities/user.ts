import type { Id, Taka } from "../types.js";

/**
 * A colleague. Sourced from the directory — no self-registration in Phase 1.
 *
 * There is no driver/rider role split: many colleagues are both, and asking
 * people to declare one at signup forces a choice they cannot yet make.
 */
export interface User {
  readonly id: Id;
  readonly displayName: string;
  readonly email: string;
  readonly department: string;
  readonly officeLocation: string;
  /**
   * Masked by default, never visible before a confirmed booking, and every
   * reveal is audit-logged.
   *
   * The legacy workbook had a Contact number column that was empty in all 20
   * rows, while one poster typed their number into the free-text *name* field
   * where every reader could see it (LEGACY_AUDIT.md D-05, D-06). Both failures
   * are addressed by making this a structured, access-controlled field.
   */
  readonly phone?: string;
  readonly photoUrl?: string;
  readonly role: UserRole;
  /** 0–100, derived from completed trips and no-shows. Aggregate only. */
  readonly reliabilityScore: number;
  readonly creditBalance: Taka;
  readonly isSuspended: boolean;
}

export type UserRole = "member" | "admin";

/** Mask a phone number for display before a booking is confirmed. */
export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•".repeat(digits.length);
  return `${"•".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
};
