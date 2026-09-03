import type { Id, Taka } from "../types.js";

export type BookingStatus =
  | "requested"
  | "confirmed"
  | "declined"
  | "cancelled_by_rider"
  | "cancelled_by_driver"
  | "completed"
  | "no_show_rider"
  | "no_show_driver";

/**
 * How the rider would otherwise have travelled.
 *
 * Required at booking time and unrecoverable afterwards. It is the only
 * defence against the "you are pulling people off buses" critique, and it is
 * never dropped to save a tap.
 */
export type CounterfactualMode =
  | "bus"
  | "rickshaw_cng"
  | "own_car"
  | "ride_hailing"
  | "would_not_travel";

export type SettlementMode = "credit_ledger" | "employer" | "cash";

export interface Booking {
  readonly id: Id;
  readonly rideId: Id;
  readonly riderId: Id;
  readonly boardZoneId: Id;
  readonly alightZoneId: Id;
  readonly seats: number;
  readonly status: BookingStatus;
  readonly amount: Taka;
  readonly settlementMode: SettlementMode;
  readonly counterfactualMode: CounterfactualMode;
  /**
   * Makes creation idempotent. A double-tap on a slow 3G connection must not
   * produce two bookings.
   */
  readonly idempotencyKey: string;
  readonly rowVersion: number;
}

/**
 * Whether a booking currently occupies a seat.
 *
 * A requested-but-not-yet-accepted booking holds its seat. Releasing it while
 * the driver decides would let the same seat be promised twice, which is the
 * legacy overwrite defect (L-04) in a new costume.
 */
export const holdsSeat = (status: BookingStatus): boolean =>
  status === "requested" || status === "confirmed" || status === "completed";
