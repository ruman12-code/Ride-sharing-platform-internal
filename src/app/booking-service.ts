import type { Booking } from "../domain/entities/booking.js";
import type { CounterfactualMode, SettlementMode } from "../domain/entities/booking.js";
import {
  checkRowVersion,
  computeSeatsAvailable,
  findIdempotent,
  validateBooking,
} from "../domain/policy/invariants.js";
import type { DomainError, Id, Result } from "../domain/types.js";
import { domainError, err, ok } from "../domain/types.js";
import type { BookingStore, Clock, Notifier, RideStore, UserDirectory } from "../ports/index.js";

export interface RequestSeatInput {
  readonly rideId: Id;
  readonly riderId: Id;
  readonly boardZoneId: Id;
  readonly alightZoneId: Id;
  readonly seats: number;
  readonly counterfactualMode: CounterfactualMode;
  readonly settlementMode: SettlementMode;
  readonly idempotencyKey: string;
}

export interface BookingServiceDeps {
  readonly rides: RideStore;
  readonly bookings: BookingStore;
  readonly users: UserDirectory;
  readonly clock: Clock;
  readonly notifier: Notifier;
  readonly newId: () => Id;
}

/**
 * Seat booking, with the concurrency control the legacy tool lacked.
 *
 * The shape that matters: validate against a freshly-read ride, then commit the
 * seat change with a compare-and-swap on `rowVersion`. If the CAS fails, some
 * other booking landed between our read and our write — so we re-read and try
 * once more, and if it fails again we tell the rider the seat went. We never
 * write over the other booking, and we never report success for a write that
 * did not happen.
 *
 * The legacy handler did the opposite: it read `lastRow`, wrote to `lastRow+1`,
 * and showed "Data inserted successfully!" unconditionally. Two colleagues
 * submitting at once wrote the same row; one posting vanished and both were
 * told it worked (LEGACY_AUDIT.md L-04).
 */
export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  async requestSeat(input: RequestSeatInput): Promise<Result<Booking, DomainError>> {
    const existing = findIdempotent(
      await this.deps.bookings.listForRider(input.riderId),
      input.riderId,
      input.idempotencyKey,
    );
    // A double-tap on 3G returns the first booking rather than making a second.
    if (existing) return ok(existing);

    const MAX_ATTEMPTS = 2; // initial attempt, then one retry after a conflict
    let lastConflict: DomainError | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const ride = await this.deps.rides.get(input.rideId);
      if (!ride) return err(domainError("NOT_FOUND", "That ride no longer exists."));

      const rider = await this.deps.users.get(input.riderId);
      if (!rider) return err(domainError("NOT_FOUND", "Rider not found in the directory."));

      const onThisRide = await this.deps.bookings.listForRide(ride.id);
      const ridersOther = (await this.deps.bookings.listForRider(input.riderId)).filter(
        (b) => b.rideId !== ride.id,
      );
      const otherWithTimes = await Promise.all(
        ridersOther.map(async (b) => {
          const r = await this.deps.rides.get(b.rideId);
          return { departureAt: r?.departureAt ?? "", status: b.status };
        }),
      );

      const check = validateBooking(
        {
          rideId: input.rideId,
          riderId: input.riderId,
          boardZoneId: input.boardZoneId,
          alightZoneId: input.alightZoneId,
          seats: input.seats,
          idempotencyKey: input.idempotencyKey,
          expectedRowVersion: ride.rowVersion,
        },
        {
          ride,
          existingBookings: onThisRide,
          ridersOtherBookings: otherWithTimes.filter((o) => o.departureAt !== ""),
          riderIsSuspended: rider.isSuspended,
          now: this.deps.clock.now(),
        },
      );
      if (!check.ok) return check;

      const booking: Booking = {
        id: this.deps.newId(),
        rideId: ride.id,
        riderId: input.riderId,
        boardZoneId: input.boardZoneId,
        alightZoneId: input.alightZoneId,
        seats: input.seats,
        status: "requested",
        amount: ride.costSharePerSeat * input.seats,
        settlementMode: input.settlementMode,
        counterfactualMode: input.counterfactualMode,
        idempotencyKey: input.idempotencyKey,
        rowVersion: 1,
      };

      // Commit the seat change first, under CAS. The ride row is the single
      // point of contention, so whoever wins it owns the seat.
      const seatsAfter = check.value.seatsAfter;
      const updated = await this.deps.rides.saveWithVersion(
        {
          ...ride,
          seatsAvailable: seatsAfter,
          status: seatsAfter <= 0 ? "full" : ride.status,
          rowVersion: ride.rowVersion + 1,
        },
        ride.rowVersion,
      );

      if (!updated.ok) {
        // Somebody else booked between our read and our write. Loop and re-read.
        lastConflict = updated.error;
        continue;
      }

      await this.deps.bookings.create(booking);
      await this.deps.notifier.send({
        id: `booking-request:${booking.id}`,
        recipientId: ride.driverId,
        kind: "driver_booking_request",
        title: "Someone wants a seat",
        body: `${rider.displayName} wants a seat, boarding at ${input.boardZoneId}.`,
        actions: [
          { id: `accept:${booking.id}`, label: "Accept" },
          { id: `decline:${booking.id}`, label: "Decline" },
        ],
        expiresAt: ride.departureAt,
      });
      return ok(booking);
    }

    // Two conflicts in a row means real contention, not a blip. Say so plainly
    // rather than retrying forever or silently dropping the request.
    return err(
      lastConflict ??
        domainError("CONCURRENCY_CONFLICT", "That seat just went."),
    );
  }

  /** Seats left, recomputed from bookings rather than trusted from the row. */
  async seatsAvailable(rideId: Id): Promise<number> {
    const ride = await this.deps.rides.get(rideId);
    if (!ride) return 0;
    return computeSeatsAvailable(ride.seatsTotal, await this.deps.bookings.listForRide(rideId));
  }

  /** Driver accepts a request. Version-checked like every other seat mutation. */
  async acceptBooking(bookingId: Id, driverId: Id): Promise<Result<Booking, DomainError>> {
    const booking = await this.deps.bookings.get(bookingId);
    if (!booking) return err(domainError("NOT_FOUND", "That request no longer exists."));
    const ride = await this.deps.rides.get(booking.rideId);
    if (!ride) return err(domainError("NOT_FOUND", "That ride no longer exists."));
    if (ride.driverId !== driverId) {
      return err(domainError("INVALID_INPUT", "That is not your ride."));
    }
    const version = checkRowVersion(booking.rowVersion, booking.rowVersion);
    if (!version.ok) return version;

    return this.deps.bookings.saveWithVersion(
      { ...booking, status: "confirmed", rowVersion: booking.rowVersion + 1 },
      booking.rowVersion,
    );
  }
}
