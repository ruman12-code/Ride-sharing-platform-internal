import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { newId } from "./db.js";
import { computeSeatsAvailable, validateBooking, validatePublish } from "../src/domain/policy/invariants.js";
import type { Booking } from "../src/domain/entities/booking.js";
import type { Ride } from "../src/domain/entities/ride.js";
import type { User } from "../src/domain/entities/user.js";
import { contactCounterparty } from "../src/domain/policy/contact-exchange.js";
import type { Id } from "../src/domain/types.js";

/**
 * The pilot API.
 *
 * Every write goes through the same pure domain functions the browser uses, so
 * a client cannot talk the server into a state the rules forbid. Seat counts
 * are recomputed from bookings on the server and never taken from the request.
 */

export interface Session {
  readonly userId: string;
  readonly displayName: string;
  readonly role: string;
}

interface RideRow {
  id: string; profileId: string | null; driverId: string; zoneSequence: string;
  departureAt: string; seatsTotal: number; seatsAvailable: number;
  costSharePerSeat: number; fuelPriceId: string; fuelRatePerKm: number;
  distanceKm: number; pickupPoints: string; vehicle: string; preferences: string;
  notes: string | null; status: string; rowVersion: number; provenance: string | null;
}

const toRide = (r: RideRow): Ride => ({
  id: r.id,
  ...(r.profileId ? { profileId: r.profileId } : {}),
  driverId: r.driverId,
  zoneSequence: JSON.parse(r.zoneSequence) as string[],
  departureAt: r.departureAt,
  seatsTotal: r.seatsTotal,
  seatsAvailable: r.seatsAvailable,
  costSharePerSeat: r.costSharePerSeat,
  fuelPriceId: r.fuelPriceId,
  fuelRatePerKm: r.fuelRatePerKm,
  distanceKm: r.distanceKm,
  pickupPoints: JSON.parse(r.pickupPoints) as Ride["pickupPoints"],
  vehicle: JSON.parse(r.vehicle) as Ride["vehicle"],
  preferences: JSON.parse(r.preferences) as Ride["preferences"],
  ...(r.notes ? { notes: r.notes } : {}),
  status: r.status as Ride["status"],
  rowVersion: r.rowVersion,
  ...(r.provenance === "legacy-2023" ? { provenance: "legacy-2023" as const } : {}),
});

export class Api {
  constructor(private readonly db: Db) {}

  // --- auth -------------------------------------------------------------
  //
  // Sign-in is not open. A colleague requests access with a work email, an
  // administrator who recognises the name approves them, and a single-use code
  // is issued to that one person. See server/access.ts for the three gates.

  createSession(userId: string): string {
    const token = randomUUID() + randomUUID();
    const now = Date.now();
    this.db.run(
      "INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
      token,
      userId,
      new Date(now).toISOString(),
      new Date(now + 30 * 24 * 3600_000).toISOString(),
    );
    return token;
  }

  sessionFor(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const row = this.db.get<{ userId: string; expiresAt: string }>(
      "SELECT userId, expiresAt FROM sessions WHERE token = ?",
      token,
    );
    if (!row || row.expiresAt < new Date().toISOString()) return undefined;
    const user = this.db.get<User & { status: string }>(
      "SELECT * FROM users WHERE id = ?",
      row.userId,
    );
    // Status is re-checked on every request, not only at sign-in. Suspending
    // somebody has to take effect now, and a session issued before they were
    // suspended must stop working the moment it is used.
    if (!user || user.status !== "approved" || user.isSuspended) return undefined;
    return { userId: user.id, displayName: user.displayName, role: user.role };
  }

  /** The contact details a colleague has chosen to share, if any. */
  setContact(userId: Id, kind: string, value: string): void {
    this.db.run(
      "UPDATE users SET contactKind = ?, contactValue = ? WHERE id = ?",
      kind,
      value.trim().slice(0, 60),
      userId,
    );
  }

  /**
   * Release a counterparty's contact details on a confirmed booking.
   *
   * Returns undefined for anybody who is not the driver or the rider on that
   * booking, and for any booking the driver has not yet accepted. Each release
   * is written to `contact_reveals`, so "who has my number?" has an answer.
   */
  revealContact(
    session: Session,
    bookingId: Id,
  ): { readonly name: string; readonly kind: string; readonly value: string } | undefined {
    const booking = this.db.get<Booking>("SELECT * FROM bookings WHERE id = ?", bookingId);
    if (!booking) return undefined;
    const ride = this.getRide(booking.rideId);
    if (!ride) return undefined;

    const subjectId = contactCounterparty(booking, ride.driverId, session.userId);
    if (!subjectId) return undefined;

    const subject = this.db.get<{ displayName: string; contactKind: string | null; contactValue: string | null }>(
      "SELECT displayName, contactKind, contactValue FROM users WHERE id = ?",
      subjectId,
    );
    if (!subject?.contactKind || !subject.contactValue) return undefined;

    this.db.run(
      "INSERT INTO contact_reveals (id, bookingId, viewerId, subjectId, at) VALUES (?, ?, ?, ?, ?)",
      randomUUID(), bookingId, session.userId, subjectId, new Date().toISOString(),
    );
    this.db.audit(session.userId, "contact", subjectId, "reveal");
    return { name: subject.displayName, kind: subject.contactKind, value: subject.contactValue };
  }

  /**
   * Names of everyone who can appear on a ride card.
   *
   * Display name, department and reliability only. Contact details are
   * deliberately absent: those are exchanged per booking, never listed
   * (domain/policy/contact-exchange.ts), and a directory endpoint is exactly
   * the shape that would undo that.
   */
  listPeople(): readonly { id: Id; displayName: string; department: string; reliabilityScore: number }[] {
    return this.db.all(
      `SELECT id, displayName, department, reliabilityScore
         FROM users WHERE status = 'approved' AND isSuspended = 0`,
    );
  }

  // --- rides ------------------------------------------------------------

  listRides(): readonly Ride[] {
    return this.db
      .all<RideRow>("SELECT * FROM rides WHERE status IN ('published','full') ORDER BY departureAt")
      .map(toRide);
  }

  getRide(id: string): Ride | undefined {
    const row = this.db.get<RideRow>("SELECT * FROM rides WHERE id = ?", id);
    return row ? toRide(row) : undefined;
  }

  publishRide(session: Session, input: Omit<Ride, "id" | "rowVersion" | "seatsAvailable" | "driverId" | "status">, cap: number): { ok: true; ride: Ride } | { ok: false; error: string } {
    const today = input.departureAt.slice(0, 10);
    const publishedToday = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM rides
        WHERE driverId = ? AND substr(departureAt, 1, 10) = ? AND status != 'cancelled'`,
      session.userId,
      today,
    );

    const check = validatePublish(
      {
        departureAt: input.departureAt,
        costSharePerSeat: input.costSharePerSeat,
        seatsTotal: input.seatsTotal,
      },
      cap,
      publishedToday?.n ?? 0,
      new Date().toISOString(),
    );
    if (!check.ok) return { ok: false, error: check.error.message };

    const id = newId();
    this.db.run(
      `INSERT INTO rides (id, profileId, driverId, zoneSequence, departureAt, seatsTotal,
                          seatsAvailable, costSharePerSeat, fuelPriceId, fuelRatePerKm,
                          distanceKm, pickupPoints, vehicle, preferences, notes, status,
                          rowVersion, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?)`,
      id,
      input.profileId ?? null,
      session.userId,
      JSON.stringify(input.zoneSequence),
      input.departureAt,
      input.seatsTotal,
      input.seatsTotal,
      input.costSharePerSeat,
      input.fuelPriceId,
      input.fuelRatePerKm,
      input.distanceKm,
      JSON.stringify(input.pickupPoints),
      JSON.stringify(input.vehicle),
      JSON.stringify(input.preferences),
      input.notes ?? null,
      new Date().toISOString(),
    );
    this.db.audit(session.userId, "ride", id, "publish");
    return { ok: true, ride: this.getRide(id)! };
  }

  // --- bookings ---------------------------------------------------------

  listBookingsForRide(rideId: string): readonly Booking[] {
    return this.db.all<Booking>("SELECT * FROM bookings WHERE rideId = ?", rideId);
  }

  listBookingsForRider(riderId: string): readonly Booking[] {
    return this.db.all<Booking>("SELECT * FROM bookings WHERE riderId = ?", riderId);
  }

  /**
   * Request a seat.
   *
   * Validate against a freshly read ride, claim the seat under a version check,
   * then write the booking. On a lost race, re-read and try once more; after
   * that the colleague is told the seat went. Nothing is ever overwritten.
   */
  requestSeat(
    session: Session,
    input: {
      rideId: string; boardZoneId: string; alightZoneId: string; seats: number;
      counterfactualMode: Booking["counterfactualMode"];
      settlementMode: Booking["settlementMode"]; idempotencyKey: string;
    },
  ): { ok: true; booking: Booking } | { ok: false; error: string; code: string } {
    const existing = this.db.get<Booking>(
      "SELECT * FROM bookings WHERE riderId = ? AND idempotencyKey = ?",
      session.userId,
      input.idempotencyKey,
    );
    if (existing) return { ok: true, booking: existing };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ride = this.getRide(input.rideId);
      if (!ride) return { ok: false, error: "That ride no longer exists.", code: "NOT_FOUND" };

      const user = this.db.get<User>("SELECT * FROM users WHERE id = ?", session.userId);
      const onRide = this.listBookingsForRide(ride.id);
      const others = this.db
        .all<{ departureAt: string; status: Booking["status"] }>(
          `SELECT r.departureAt AS departureAt, b.status AS status
             FROM bookings b JOIN rides r ON r.id = b.rideId
            WHERE b.riderId = ? AND b.rideId != ?`,
          session.userId,
          ride.id,
        );

      const check = validateBooking(
        { ...input, riderId: session.userId, expectedRowVersion: ride.rowVersion },
        {
          ride,
          existingBookings: onRide,
          ridersOtherBookings: others,
          riderIsSuspended: Boolean(user?.isSuspended),
          now: new Date().toISOString(),
        },
      );
      if (!check.ok) return { ok: false, error: check.error.message, code: check.error.code };

      const claimed = this.db.claimSeats(ride.id, ride.rowVersion, check.value.seatsAfter);
      if (!claimed) continue; // somebody else got there first — re-read and retry

      const id = newId();
      this.db.run(
        `INSERT INTO bookings (id, rideId, riderId, boardZoneId, alightZoneId, seats, status,
                               amount, settlementMode, counterfactualMode, idempotencyKey,
                               rowVersion, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, 1, ?)`,
        id, ride.id, session.userId, input.boardZoneId, input.alightZoneId, input.seats,
        ride.costSharePerSeat * input.seats, input.settlementMode,
        input.counterfactualMode, input.idempotencyKey, new Date().toISOString(),
      );
      this.db.audit(session.userId, "booking", id, "request");
      return { ok: true, booking: this.db.get<Booking>("SELECT * FROM bookings WHERE id = ?", id)! };
    }

    return { ok: false, error: "That seat just went.", code: "SEAT_TAKEN" };
  }

  /** Recomputed from bookings, never trusted from the row. */
  seatsAvailable(rideId: string): number {
    const ride = this.getRide(rideId);
    if (!ride) return 0;
    return computeSeatsAvailable(ride.seatsTotal, this.listBookingsForRide(rideId));
  }

  completeTrip(session: Session, bookingId: string): { ok: boolean; error?: string } {
    return this.db.transaction(() => {
      const booking = this.db.get<Booking>("SELECT * FROM bookings WHERE id = ?", bookingId);
      if (!booking) return { ok: false, error: "No such booking." };
      const ride = this.getRide(booking.rideId);
      if (!ride) return { ok: false, error: "No such ride." };
      if (booking.riderId !== session.userId && ride.driverId !== session.userId) {
        return { ok: false, error: "That is not your trip." };
      }

      this.db.run("UPDATE bookings SET status = 'completed', rowVersion = rowVersion + 1 WHERE id = ?", bookingId);
      // UNIQUE(bookingId) makes this idempotent at the storage layer: completing
      // twice cannot double the credit.
      this.db.run(
        `INSERT OR IGNORE INTO ledger (id, bookingId, fromUserId, toUserId, amount, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        newId(), bookingId, booking.riderId, ride.driverId, booking.amount,
        new Date().toISOString(),
      );
      this.db.audit(session.userId, "booking", bookingId, "complete");
      return { ok: true };
    });
  }

  recordZeroResult(session: Session, q: {
    originZoneId: string; destinationZoneId: string; targetTime: string;
    windowMinutes: number; seats: number; alert: boolean;
  }): void {
    this.db.run(
      `INSERT INTO zero_result_searches
         (id, searcherId, originZoneId, destinationZoneId, targetTime, windowMinutes, seats, at, convertedToStandingDemand)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(), session.userId, q.originZoneId, q.destinationZoneId, q.targetTime,
      q.windowMinutes, q.seats, new Date().toISOString(), q.alert ? 1 : 0,
    );
    if (q.alert) {
      this.db.run(
        `INSERT INTO standing_demand
           (id, riderId, originZoneId, destinationZoneId, targetTime, windowMinutes, createdAt, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        newId(), session.userId, q.originZoneId, q.destinationZoneId, q.targetTime,
        q.windowMinutes, new Date().toISOString(),
      );
    }
  }
}
