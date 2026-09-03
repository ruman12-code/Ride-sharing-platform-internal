import type { DayOfWeek, Id, IsoDate, IsoDateTime, Taka } from "../types.js";

export interface Vehicle {
  readonly type: VehicleType;
  readonly model: string;
  readonly colour: string;
  /** Last four characters of the plate. Enough to identify, not to trace. */
  readonly plateLast4: string;
  /** Manufacturer's rated economy. Congestion-adjusted before use. */
  readonly ratedKmPerLitre?: number;
  /** The driver's own tank-to-tank measurement. Beats any default. */
  readonly measuredKmPerLitre?: number;
  readonly fuelType: "octane" | "petrol" | "diesel" | "cng";
}

export type VehicleType = "car" | "suv" | "microbus" | "motorcycle";

export interface RidePreferences {
  readonly womenOnly: boolean;
  readonly ac: boolean;
  readonly luggage: boolean;
  readonly quiet: boolean;
}

export interface PickupPoint {
  readonly zoneId: Id;
  readonly label: string;
  readonly walkingMinutes: number;
}

export type RideStatus =
  | "draft"
  | "published"
  | "full"
  | "cancelled"
  | "in_progress"
  | "completed";

/**
 * One journey on one date.
 *
 * Usually generated from a `CommuteProfile` rather than typed. In the legacy
 * file, 9 of 20 postings were re-entries of a route the same person had already
 * described (LEGACY_AUDIT.md D-07) — that re-typing is the friction the profile
 * removes.
 */
export interface Ride {
  readonly id: Id;
  readonly profileId?: Id;
  readonly driverId: Id;
  /** Ordered. Matching requires index(board) < index(alight). */
  readonly zoneSequence: readonly Id[];
  /** ISO 8601 with an explicit +06:00 offset. Never locale-dependent text. */
  readonly departureAt: IsoDateTime;
  readonly seatsTotal: number;
  /**
   * Server-computed only, never client-supplied.
   * Invariant: seatsTotal − Σ(seats of confirmed bookings).
   */
  readonly seatsAvailable: number;
  readonly costSharePerSeat: Taka;
  /** The dated fuel price this ride's cost was computed against. */
  readonly fuelPriceId: Id;
  readonly fuelRatePerKm: number;
  readonly distanceKm: number;
  readonly pickupPoints: readonly PickupPoint[];
  readonly vehicle: Vehicle;
  readonly preferences: RidePreferences;
  readonly notes?: string;
  readonly status: RideStatus;
  /** Optimistic concurrency token. Every seat mutation checks it. */
  readonly rowVersion: number;
  /** Marks rows migrated from the workbook so they never count as adoption. */
  readonly provenance?: "legacy-2023";
}

/**
 * A driver's standing commute. The primary entity in this product.
 *
 * Created once; the system generates `Ride` instances for the next 14 days and
 * the driver's daily interaction is one tap in a notification.
 */
export interface CommuteProfile {
  readonly id: Id;
  readonly driverId: Id;
  readonly originZoneId: Id;
  readonly destinationZoneId: Id;
  readonly viaZoneIds: readonly Id[];
  /** `HH:MM` in Dhaka time. */
  readonly departureWindowStart: string;
  readonly departureWindowEnd: string;
  readonly daysOfWeek: readonly DayOfWeek[];
  readonly seatsOffered: number;
  readonly vehicle: Vehicle;
  readonly isActive: boolean;
  readonly validUntil: IsoDate;
  /** When true, rides publish without waiting for the daily confirmation. */
  readonly autoPublish: boolean;
}

/** The full zone sequence a profile implies, origin through destination. */
export const profileZoneSequence = (p: CommuteProfile): readonly Id[] => [
  p.originZoneId,
  ...p.viaZoneIds,
  p.destinationZoneId,
];
