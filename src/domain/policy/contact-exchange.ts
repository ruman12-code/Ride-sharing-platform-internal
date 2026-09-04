import type { Booking } from "../entities/booking.js";
import type { Id, IsoDateTime } from "../types.js";

/**
 * How a driver and a rider actually find each other.
 *
 * The rule in one line: **contact details are never listed, and are released
 * only after the driver has accepted a specific rider.**
 *
 * Why it is built this way rather than as a directory:
 *
 * A stored, browsable list of colleagues' numbers is exactly the shape of the
 * legacy workbook's worst privacy defect — one poster typed their number into a
 * free-text name field where every reader of the file could see it
 * (LEGACY_AUDIT.md D-06). Rebuilding that as a feature, behind a sign-in that
 * in pilot mode is a shared passphrase, would be repeating the mistake on
 * purpose.
 *
 * An exchange has a different shape. Nothing is disclosed until a named driver
 * has looked at a named rider and said yes. The driver holds the gate; a
 * request they decline discloses nothing, and declining is silent. Every
 * release is written to the audit log, so who saw whose details is answerable
 * rather than assumed.
 */

/** A way to reach someone. Held per person, disclosed per booking. */
export interface ContactHandle {
  readonly kind: ContactKind;
  readonly value: string;
}

export type ContactKind = "phone" | "whatsapp" | "email" | "teams";

/**
 * The only booking states in which contact may be released.
 *
 * `requested` is deliberately absent: a rider who has merely asked has not been
 * accepted by anybody, and releasing the driver's number at that point would
 * let anyone harvest details simply by requesting seats.
 */
const EXCHANGEABLE: readonly Booking["status"][] = ["confirmed", "completed"];

export const mayExchangeContact = (booking: Pick<Booking, "status">): boolean =>
  EXCHANGEABLE.includes(booking.status);

/**
 * Who is entitled to see whose details on a given booking.
 *
 * Both directions, and only these two people. A rider needs the driver's
 * number to say "I'm at the gate"; a driver needs the rider's to say "I'm two
 * minutes away". One-way disclosure would leave one of them stranded.
 */
export const contactCounterparty = (
  booking: Pick<Booking, "riderId" | "status">,
  rideDriverId: Id,
  viewerId: Id,
): Id | undefined => {
  if (!mayExchangeContact(booking)) return undefined;
  if (viewerId === rideDriverId) return booking.riderId;
  if (viewerId === booking.riderId) return rideDriverId;
  return undefined;
};

/** Masked for display anywhere a number appears before it is released. */
export const maskContact = (handle: ContactHandle): string => {
  if (handle.kind === "email") {
    const [name = "", domain = ""] = handle.value.split("@");
    return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
  }
  const digits = handle.value.replace(/\D/g, "");
  if (digits.length < 4) return "•".repeat(Math.max(3, digits.length));
  return `${"•".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
};

export interface ContactReveal {
  readonly bookingId: Id;
  readonly viewerId: Id;
  readonly subjectId: Id;
  readonly at: IsoDateTime;
}

/**
 * The audit entry for a release.
 *
 * Every reveal is logged. Not as a deterrent — as an answer, so the question
 * "who has my number?" has one.
 */
export const revealEntry = (
  bookingId: Id,
  viewerId: Id,
  subjectId: Id,
  at: IsoDateTime,
): ContactReveal => ({ bookingId, viewerId, subjectId, at });

/**
 * Guidance shown beside the field where a colleague sets their contact.
 *
 * Written to be read, because the honest answer to "who will see this?" is what
 * decides whether somebody fills it in truthfully.
 */
export const CONTACT_NOTICE = {
  en:
    "Only shared with a colleague after you accept their seat, or after a driver " +
    "accepts yours. Never listed, never searchable, and every time it is shown we record it.",
  bn:
    "কেবল তখনই দেখানো হয় যখন আপনি কারও সিট গ্রহণ করেন, বা কোনো চালক আপনার সিট " +
    "গ্রহণ করেন। কোথাও তালিকাভুক্ত বা খোঁজার উপায় নেই, এবং প্রতিবার দেখানো হলে তা রেকর্ড হয়।",
} as const;
