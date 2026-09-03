import type { Booking } from "../domain/entities/booking.js";
import type { CommuteProfile, Ride } from "../domain/entities/ride.js";
import type { CreditEntry } from "../domain/entities/ledger.js";
import type { User } from "../domain/entities/user.js";
import type { Zone } from "../domain/entities/zone.js";
import type { FuelPrice } from "../domain/pricing/fuel.js";
import type {
  AuditLog,
  StandingDemand,
  ZeroResultSearch,
} from "../domain/entities/support.js";
import type { DomainError, Id, IsoDate, IsoDateTime, Result } from "../domain/types.js";

/**
 * The boundary. Everything below it is swappable without touching business
 * logic — SharePoint Lists today, Dataverse or a hosted database tomorrow.
 *
 * SharePoint Lists have no transactions and no foreign keys, so the contract
 * here is deliberately narrow: single-entity reads and writes, with the only
 * atomicity guarantee being the compare-and-swap in `saveWithVersion`. Anything
 * richer would be a promise the production adapter cannot keep.
 */

/** Time enters the domain only through here, so tests are deterministic. */
export interface Clock {
  now(): IsoDateTime;
  today(): IsoDate;
}

export interface RideStore {
  get(id: Id): Promise<Ride | undefined>;
  list(filter?: RideFilter): Promise<readonly Ride[]>;
  create(ride: Ride): Promise<Ride>;
  /**
   * Compare-and-swap on `rowVersion`.
   *
   * Returns CONCURRENCY_CONFLICT if the stored version differs from
   * `expectedRowVersion`. Implementations MUST NOT fall back to last-write-wins;
   * that is the legacy `lastRow + 1` defect, which lost postings silently.
   */
  saveWithVersion(ride: Ride, expectedRowVersion: number): Promise<Result<Ride, DomainError>>;
}

export interface RideFilter {
  readonly driverId?: Id;
  readonly status?: Ride["status"];
  readonly fromDate?: IsoDate;
  readonly toDate?: IsoDate;
}

export interface BookingStore {
  get(id: Id): Promise<Booking | undefined>;
  listForRide(rideId: Id): Promise<readonly Booking[]>;
  listForRider(riderId: Id): Promise<readonly Booking[]>;
  create(booking: Booking): Promise<Booking>;
  saveWithVersion(
    booking: Booking,
    expectedRowVersion: number,
  ): Promise<Result<Booking, DomainError>>;
}

export interface CommuteProfileStore {
  get(id: Id): Promise<CommuteProfile | undefined>;
  listForDriver(driverId: Id): Promise<readonly CommuteProfile[]>;
  listActive(): Promise<readonly CommuteProfile[]>;
  create(profile: CommuteProfile): Promise<CommuteProfile>;
  save(profile: CommuteProfile): Promise<CommuteProfile>;
}

/** Read-only. Users come from the directory; there is no self-registration. */
export interface UserDirectory {
  get(id: Id): Promise<User | undefined>;
  list(): Promise<readonly User[]>;
}

export interface ZoneStore {
  list(): Promise<readonly Zone[]>;
}

export interface FuelPriceStore {
  list(): Promise<readonly FuelPrice[]>;
  create(price: FuelPrice): Promise<FuelPrice>;
  confirm(id: Id, on: IsoDate): Promise<FuelPrice>;
}

export interface LedgerStore {
  listForUser(userId: Id): Promise<readonly CreditEntry[]>;
  create(entry: CreditEntry): Promise<CreditEntry>;
  listAll(): Promise<readonly CreditEntry[]>;
}

export interface AuditStore {
  append(entry: AuditLog): Promise<void>;
  list(entityId?: Id): Promise<readonly AuditLog[]>;
}

export interface DemandStore {
  recordZeroResult(search: ZeroResultSearch): Promise<void>;
  createStandingDemand(demand: StandingDemand): Promise<StandingDemand>;
  listActiveDemand(): Promise<readonly StandingDemand[]>;
  listZeroResults(): Promise<readonly ZeroResultSearch[]>;
}

/**
 * Outbound notifications. Every one is idempotent and expires.
 *
 * This port is the product. The legacy tool failed because it waited to be
 * opened; anything that cannot be completed from a notification is not
 * finished.
 */
export interface Notifier {
  send(n: Notification): Promise<void>;
}

export interface Notification {
  /** Stable per (recipient, kind, subject). Re-sending the same id is a no-op. */
  readonly id: string;
  readonly recipientId: Id;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly actions: readonly NotificationAction[];
  readonly expiresAt: IsoDateTime;
}

export type NotificationKind =
  | "driver_publish_prompt"
  | "rider_match_found"
  | "driver_booking_request"
  | "reconfirm"
  | "post_trip_rating"
  | "weekly_digest";

export interface NotificationAction {
  readonly id: string;
  readonly label: string;
  /** Deep link used only when the action cannot be completed inline. */
  readonly href?: string;
}
