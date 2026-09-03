import type { Booking } from "../entities/booking.js";
import { holdsSeat } from "../entities/booking.js";
import type { Ride } from "../entities/ride.js";
import type { DomainError, Id, IsoDateTime, Result, Taka } from "../types.js";
import { dateOf, domainError, err, ok } from "../types.js";
import { isWithinCap } from "../pricing/cost-share.js";

/**
 * The rules that must hold no matter which adapter is underneath, and no matter
 * what a client sends.
 *
 * Every function here is pure. Storage enforces nothing; the domain enforces
 * everything. That inversion is the whole lesson of the legacy tool, where the
 * "rules" lived in a UserForm and were bypassed by anyone who typed into the
 * sheet directly.
 */

/**
 * Seats available, recomputed from bookings. Never client-supplied.
 *
 * The legacy handler computed `lastRow + 1` and wrote, with no lock and no
 * verification, so two colleagues submitting at once silently overwrote each
 * other and both saw "success" (LEGACY_AUDIT.md L-04).
 */
export const computeSeatsAvailable = (
  seatsTotal: number,
  bookings: readonly Booking[],
): number => {
  const held = bookings
    .filter((b) => holdsSeat(b.status))
    .reduce((sum, b) => sum + b.seats, 0);
  return seatsTotal - held;
};

export interface BookingRequest {
  readonly rideId: Id;
  readonly riderId: Id;
  readonly boardZoneId: Id;
  readonly alightZoneId: Id;
  readonly seats: number;
  readonly idempotencyKey: string;
  /** The version the client last saw. Rejected if the ride has moved on. */
  readonly expectedRowVersion: number;
}

export interface BookingContext {
  readonly ride: Ride;
  /** Every booking already against this ride. */
  readonly existingBookings: readonly Booking[];
  /** This rider's bookings on other rides, for overlap detection. */
  readonly ridersOtherBookings: readonly { readonly departureAt: IsoDateTime; readonly status: Booking["status"] }[];
  readonly riderIsSuspended: boolean;
  readonly now: IsoDateTime;
}

/**
 * Can this booking be created?
 *
 * Checks run in a deliberate order: identity and eligibility first (cheap,
 * and the answers do not change), then the seat check last, because that is
 * the one that races. Returning `SEAT_TAKEN` from here is a normal outcome the
 * UI renders as "that seat just went", not an error to log.
 */
export const validateBooking = (
  req: BookingRequest,
  ctx: BookingContext,
): Result<{ readonly seatsAfter: number }, DomainError> => {
  const { ride } = ctx;

  if (ctx.riderIsSuspended) {
    return err(domainError("SUSPENDED", "Your account is suspended."));
  }

  // "Full" is not the same as "closed", and the rider deserves the real reason.
  // Telling someone a ride is unavailable when the truth is that the last seat
  // went a moment ago is the kind of small dishonesty that erodes trust in a
  // tool colleagues have to keep choosing to use.
  if (ride.status === "full") {
    return err(domainError("SEAT_TAKEN", "That seat just went.", { status: ride.status }));
  }

  if (ride.status !== "published") {
    return err(
      domainError("RIDE_NOT_PUBLISHED", "This ride is no longer open for booking.", {
        status: ride.status,
      }),
    );
  }

  if (ride.driverId === req.riderId) {
    return err(domainError("SELF_BOOKING", "You cannot book a seat on your own ride."));
  }

  if (ride.departureAt <= ctx.now) {
    return err(domainError("DEPARTURE_IN_PAST", "That ride has already departed."));
  }

  if (!Number.isInteger(req.seats) || req.seats < 1) {
    return err(
      domainError("INVALID_INPUT", "Seat count must be a whole number of at least 1.", {
        seats: req.seats,
      }),
    );
  }

  // Board must come strictly before alight in the ride's ordered sequence.
  const board = ride.zoneSequence.indexOf(req.boardZoneId);
  const alight = ride.zoneSequence.indexOf(req.alightZoneId);
  if (board === -1 || alight === -1 || board >= alight) {
    return err(
      domainError("INVALID_INPUT", "Those stops are not on this route, in that order.", {
        board,
        alight,
      }),
    );
  }

  // A rider cannot hold two seats on the same ride. Distinct idempotency keys
  // make two requests genuinely distinct, so idempotency alone does not stop
  // this -- it needs its own rule.
  const alreadyOnThisRide = ctx.existingBookings.some(
    (b) => b.riderId === req.riderId && holdsSeat(b.status),
  );
  if (alreadyOnThisRide) {
    return err(
      domainError("OVERLAPPING_BOOKING", "You already have a seat on this ride."),
    );
  }

  // One rider, one ride per departure window. Two seats on two cars at 07:45
  // means one driver waits for somebody who is never coming.
  const clash = ctx.ridersOtherBookings.find(
    (b) => holdsSeat(b.status) && dateOf(b.departureAt) === dateOf(ride.departureAt),
  );
  if (clash) {
    return err(
      domainError("OVERLAPPING_BOOKING", "You already have a ride booked that day."),
    );
  }

  // Seat availability last: it is the check that races.
  const available = computeSeatsAvailable(ride.seatsTotal, ctx.existingBookings);
  if (available < req.seats) {
    return err(
      domainError(
        available <= 0 ? "SEAT_TAKEN" : "INSUFFICIENT_SEATS",
        available <= 0
          ? "That seat just went."
          : `Only ${available} ${available === 1 ? "seat is" : "seats are"} left.`,
        { available, requested: req.seats },
      ),
    );
  }

  return ok({ seatsAfter: available - req.seats });
};

/**
 * Optimistic concurrency check.
 *
 * On conflict the caller re-reads and retries **once**, then surfaces the
 * outcome. Never last-write-wins, and never a silently swallowed conflict.
 */
export const checkRowVersion = (
  expected: number,
  actual: number,
): Result<void, DomainError> =>
  expected === actual
    ? ok(undefined)
    : err(
        domainError("CONCURRENCY_CONFLICT", "Someone else just changed this ride.", {
          expected,
          actual,
        }),
      );

/**
 * Find an existing booking for this idempotency key.
 *
 * A double-tap on a slow connection must return the first booking, not create a
 * second. The key is supplied by the client and scoped to the rider.
 */
export const findIdempotent = (
  bookings: readonly Booking[],
  riderId: Id,
  idempotencyKey: string,
): Booking | undefined =>
  bookings.find((b) => b.riderId === riderId && b.idempotencyKey === idempotencyKey);

/** A cost share above the computed cap is rejected here, before any store sees it. */
export const validateCostShare = (
  proposed: Taka,
  cap: Taka,
): Result<Taka, DomainError> =>
  isWithinCap(proposed, cap)
    ? ok(proposed)
    : err(
        domainError(
          "COST_SHARE_EXCEEDS_CAP",
          `A seat cannot be more than Tk ${cap} on this trip.`,
          { proposed, cap },
        ),
      );

/** Default daily cap on published rides per driver. Configurable, never removed. */
export const DEFAULT_DAILY_RIDE_CAP = 2;

export const validatePublish = (
  ride: Pick<Ride, "departureAt" | "costSharePerSeat" | "seatsTotal">,
  cap: Taka,
  ridesAlreadyPublishedToday: number,
  now: IsoDateTime,
  dailyCap: number = DEFAULT_DAILY_RIDE_CAP,
): Result<void, DomainError> => {
  if (ride.departureAt <= now) {
    return err(domainError("DEPARTURE_IN_PAST", "That departure time has already passed."));
  }
  if (!Number.isInteger(ride.seatsTotal) || ride.seatsTotal < 1) {
    // The legacy file contains "plenty" as a seat count (D-03). The UI uses a
    // stepper, and the domain refuses anything that is not a whole number.
    return err(
      domainError("INVALID_INPUT", "Seats must be a whole number of at least 1.", {
        seatsTotal: ride.seatsTotal,
      }),
    );
  }
  if (!isWithinCap(ride.costSharePerSeat, cap)) {
    return err(
      domainError("COST_SHARE_EXCEEDS_CAP", `A seat cannot be more than Tk ${cap} on this trip.`, {
        proposed: ride.costSharePerSeat,
        cap,
      }),
    );
  }
  if (ridesAlreadyPublishedToday >= dailyCap) {
    return err(
      domainError("DAILY_RIDE_CAP_REACHED", `You can publish ${dailyCap} rides a day.`, {
        dailyCap,
      }),
    );
  }
  return ok(undefined);
};
