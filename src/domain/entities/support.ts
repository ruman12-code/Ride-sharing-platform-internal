import type { Id, IsoDateTime } from "../types.js";

/** Aggregate display only. A rating is never shown attributed to its rater. */
export interface Feedback {
  readonly bookingId: Id;
  readonly raterId: Id;
  readonly rateeId: Id;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly tags: readonly string[];
  readonly comment?: string;
}

export interface Incident {
  readonly id: Id;
  readonly bookingId: Id;
  readonly reporterId: Id;
  readonly category: IncidentCategory;
  readonly severity: "low" | "medium" | "high";
  readonly description: string;
  readonly status: "open" | "investigating" | "resolved" | "dismissed";
  readonly assignedTo?: Id;
  readonly resolvedAt?: IsoDateTime;
}

export type IncidentCategory =
  | "safety"
  | "harassment"
  | "no_show"
  | "unsafe_driving"
  | "payment_dispute"
  | "other";

/**
 * Every mutation, with before and after.
 *
 * The legacy tool had no record of who changed what, which is why nobody could
 * establish whether a single ride ever happened (LEGACY_AUDIT.md D-08, D-10).
 */
export interface AuditLog {
  readonly id: Id;
  readonly actorId: Id;
  readonly entity: string;
  readonly entityId: Id;
  readonly action: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly at: IsoDateTime;
}

export interface ConsentRecord {
  readonly userId: Id;
  readonly policyVersion: string;
  readonly grantedAt: IsoDateTime;
  readonly scopes: readonly string[];
  readonly withdrawnAt?: IsoDateTime;
}

/** A rider's unmet need. Every zero-result search can become one of these. */
export interface StandingDemand {
  readonly id: Id;
  readonly riderId: Id;
  readonly originZoneId: Id;
  readonly destinationZoneId: Id;
  readonly targetTime: string;
  readonly windowMinutes: number;
  readonly createdAt: IsoDateTime;
  readonly isActive: boolean;
}

/**
 * A search that returned nothing, logged with its full parameters.
 *
 * A first-class outcome, not an error. At this headcount these logs are a
 * better demand signal than the posting count, because they capture intent that
 * never found supply — exactly the quantity the legacy file is missing and the
 * reason it can tell us nothing about demand
 * (LIQUIDITY_BASELINE.md, "Zero-result searches are the demand map").
 */
export interface ZeroResultSearch {
  readonly id: Id;
  readonly searcherId: Id;
  readonly originZoneId: Id;
  readonly destinationZoneId: Id;
  readonly targetTime: IsoDateTime;
  readonly windowMinutes: number;
  readonly seats: number;
  readonly at: IsoDateTime;
  readonly convertedToStandingDemand: boolean;
}
