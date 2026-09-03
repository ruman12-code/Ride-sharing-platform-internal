/**
 * Shared domain primitives.
 *
 * Nothing here performs I/O or reads a clock. Time enters the domain only
 * through the `Clock` port, so every calculation is deterministic under test.
 */

/** Opaque-ish identifier. Stable for the life of the entity. */
export type Id = string;

/**
 * An instant, ISO 8601 with an explicit offset — always `+06:00` for Dhaka.
 *
 * Never a bare date string. The legacy workbook mixed `dd/mm/yyyy` text with
 * Excel date serials in one column; Excel parsed the text under a US locale and
 * two postings landed months away from where they belonged, unrecoverably
 * (LEGACY_AUDIT.md D-02). An explicit offset removes the entire class of defect.
 */
export type IsoDateTime = string;

/** A calendar date, `YYYY-MM-DD`, interpreted in Asia/Dhaka. */
export type IsoDate = string;

/** Bangladeshi Taka, whole units. No fractional Taka anywhere in this domain. */
export type Taka = number;

/** Sunday = 0 through Saturday = 6. The working week here is Sun–Thu. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DHAKA_UTC_OFFSET = "+06:00" as const;

/** The default working week for this organisation. */
export const DEFAULT_WORKING_DAYS: readonly DayOfWeek[] = [0, 1, 2, 3, 4];

/**
 * Outcome of an operation that can fail for a *business* reason.
 *
 * Business failures are values, not exceptions: "that seat just went" is a
 * normal outcome the UI must render, not an error to log. Exceptions remain
 * reserved for programming faults.
 */
export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  /** Extra context for the UI or the audit log. Never contains PII. */
  readonly detail?: Readonly<Record<string, unknown>>;
}

export type DomainErrorCode =
  | "SEAT_TAKEN"
  | "CONCURRENCY_CONFLICT"
  | "COST_SHARE_EXCEEDS_CAP"
  | "DEPARTURE_IN_PAST"
  | "SELF_BOOKING"
  | "OVERLAPPING_BOOKING"
  | "DAILY_RIDE_CAP_REACHED"
  | "RIDE_NOT_PUBLISHED"
  | "INSUFFICIENT_SEATS"
  | "FUEL_PRICE_STALE"
  | "FUEL_PRICE_MISSING"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "SUSPENDED";

export const domainError = (
  code: DomainErrorCode,
  message: string,
  detail?: Readonly<Record<string, unknown>>,
): DomainError => (detail === undefined ? { code, message } : { code, message, detail });

/** Minutes since midnight, for time-window arithmetic. */
export const minutesOfDay = (iso: IsoDateTime): number => {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) throw new Error(`not an ISO date-time: ${iso}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** The `YYYY-MM-DD` portion, without shifting the instant into another zone. */
export const dateOf = (iso: IsoDateTime): IsoDate => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (!m) throw new Error(`not an ISO date-time: ${iso}`);
  return m[1] as IsoDate;
};
