import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_RIDE_CAP,
  checkRowVersion,
  computeSeatsAvailable,
  findIdempotent,
  validateBooking,
  validateCostShare,
  validatePublish,
} from "./invariants.js";
import type { BookingContext, BookingRequest } from "./invariants.js";
import type { Booking, BookingStatus } from "../entities/booking.js";
import { ride } from "../../test/factories.js";

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "bk-1",
  rideId: "ride-1",
  riderId: "u-rider",
  boardZoneId: "khilkhet",
  alightZoneId: "gulshan-2",
  seats: 1,
  status: "confirmed",
  amount: 70,
  settlementMode: "credit_ledger",
  counterfactualMode: "bus",
  idempotencyKey: "k-1",
  rowVersion: 1,
  ...over,
});

const req = (over: Partial<BookingRequest> = {}): BookingRequest => ({
  rideId: "ride-1",
  riderId: "u-rider",
  boardZoneId: "khilkhet",
  alightZoneId: "gulshan-2",
  seats: 1,
  idempotencyKey: "k-1",
  expectedRowVersion: 1,
  ...over,
});

const ctx = (over: Partial<BookingContext> = {}): BookingContext => ({
  ride: ride({ seatsTotal: 3, seatsAvailable: 3 }),
  existingBookings: [],
  ridersOtherBookings: [],
  riderIsSuspended: false,
  now: "2026-09-03T21:00:00+06:00",
  ...over,
});

describe("computeSeatsAvailable", () => {
  it("subtracts only the bookings that hold a seat", () => {
    const held: BookingStatus[] = ["requested", "confirmed", "completed"];
    const released: BookingStatus[] = [
      "declined",
      "cancelled_by_rider",
      "cancelled_by_driver",
      "no_show_rider",
      "no_show_driver",
    ];
    for (const status of held) {
      expect(computeSeatsAvailable(3, [booking({ status })])).toBe(2);
    }
    for (const status of released) {
      expect(computeSeatsAvailable(3, [booking({ status })])).toBe(3);
    }
  });

  it("counts multi-seat bookings", () => {
    expect(computeSeatsAvailable(4, [booking({ seats: 3 })])).toBe(1);
  });

  it("is derived, never trusted from the row", () => {
    // A client that sends seatsAvailable: 99 cannot influence this number.
    expect(computeSeatsAvailable(2, [booking(), booking({ id: "bk-2", riderId: "u-2" })])).toBe(0);
  });
});

describe("validateBooking", () => {
  it("accepts a well-formed request", () => {
    const r = validateBooking(req(), ctx());
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.seatsAfter).toBe(2);
  });

  it("refuses a suspended rider", () => {
    const r = validateBooking(req(), ctx({ riderIsSuspended: true }));
    expect(r.ok === false && r.error.code).toBe("SUSPENDED");
  });

  it("tells a rider the seat went, rather than that the ride is closed", () => {
    const r = validateBooking(req(), ctx({ ride: ride({ status: "full" }) }));
    expect(r.ok === false && r.error.code).toBe("SEAT_TAKEN");
    expect(r.ok === false && r.error.message).toBe("That seat just went.");
  });

  it("refuses an unpublished ride", () => {
    for (const status of ["draft", "cancelled", "completed", "in_progress"] as const) {
      const r = validateBooking(req(), ctx({ ride: ride({ status }) }));
      expect(r.ok === false && r.error.code).toBe("RIDE_NOT_PUBLISHED");
    }
  });

  it("refuses self-booking", () => {
    const r = validateBooking(req({ riderId: "u-driver" }), ctx());
    expect(r.ok === false && r.error.code).toBe("SELF_BOOKING");
  });

  it("refuses a departure that has already passed", () => {
    const r = validateBooking(req(), ctx({ now: "2026-09-04T08:00:00+06:00" }));
    expect(r.ok === false && r.error.code).toBe("DEPARTURE_IN_PAST");
  });

  it("refuses a seat count that is not a whole number", () => {
    // The legacy file contains "plenty" in the seat column (D-03).
    for (const seats of [0, -1, 1.5, Number.NaN]) {
      const r = validateBooking(req({ seats }), ctx());
      expect(r.ok === false && r.error.code).toBe("INVALID_INPUT");
    }
  });

  it("refuses stops that are not on the route, or are in the wrong order", () => {
    const pairs: readonly (readonly [string, string])[] = [
      ["gulshan-2", "uttara"],
      ["savar", "gulshan-2"],
      ["uttara", "savar"],
      ["banani", "banani"],
    ];
    for (const [board, alight] of pairs) {
      const r = validateBooking(req({ boardZoneId: board, alightZoneId: alight }), ctx());
      expect(r.ok === false && r.error.code).toBe("INVALID_INPUT");
    }
  });

  it("refuses a second seat on the same ride, even with a fresh idempotency key", () => {
    const r = validateBooking(
      req({ idempotencyKey: "different" }),
      ctx({ existingBookings: [booking({ riderId: "u-rider" })] }),
    );
    expect(r.ok === false && r.error.code).toBe("OVERLAPPING_BOOKING");
  });

  it("refuses a second ride on the same day", () => {
    const r = validateBooking(
      req(),
      ctx({
        ridersOtherBookings: [
          { departureAt: "2026-09-04T18:00:00+06:00", status: "confirmed" },
        ],
      }),
    );
    expect(r.ok === false && r.error.code).toBe("OVERLAPPING_BOOKING");
  });

  it("allows a ride on a different day", () => {
    const r = validateBooking(
      req(),
      ctx({
        ridersOtherBookings: [
          { departureAt: "2026-09-05T07:45:00+06:00", status: "confirmed" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("ignores a cancelled booking when checking for a clash", () => {
    const r = validateBooking(
      req(),
      ctx({
        ridersOtherBookings: [
          { departureAt: "2026-09-04T07:00:00+06:00", status: "cancelled_by_rider" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("says how many seats are left when some but not enough remain", () => {
    const r = validateBooking(
      req({ seats: 3 }),
      ctx({
        ride: ride({ seatsTotal: 3, seatsAvailable: 3 }),
        existingBookings: [booking({ riderId: "u-other", seats: 2 })],
      }),
    );
    expect(r.ok === false && r.error.code).toBe("INSUFFICIENT_SEATS");
    expect(r.ok === false && r.error.message).toContain("1 seat is left");
  });

  it("says the seat went when none remain", () => {
    const r = validateBooking(
      req(),
      ctx({ ride: ride({ seatsTotal: 1 }), existingBookings: [booking({ riderId: "u-other" })] }),
    );
    expect(r.ok === false && r.error.code).toBe("SEAT_TAKEN");
  });
});

describe("checkRowVersion", () => {
  it("passes when the client saw the current version", () => {
    expect(checkRowVersion(4, 4).ok).toBe(true);
  });

  it("reports a conflict, never last-write-wins", () => {
    const r = checkRowVersion(3, 4);
    expect(r.ok === false && r.error.code).toBe("CONCURRENCY_CONFLICT");
    expect(r.ok === false && r.error.detail).toEqual({ expected: 3, actual: 4 });
  });
});

describe("findIdempotent", () => {
  it("finds this rider's earlier request with the same key", () => {
    expect(findIdempotent([booking()], "u-rider", "k-1")?.id).toBe("bk-1");
  });

  it("does not match another rider's key", () => {
    expect(findIdempotent([booking()], "u-other", "k-1")).toBeUndefined();
  });

  it("does not match a different key", () => {
    expect(findIdempotent([booking()], "u-rider", "k-2")).toBeUndefined();
  });
});

describe("validateCostShare", () => {
  it("accepts the cap, and anything below it including zero", () => {
    expect(validateCostShare(70, 70).ok).toBe(true);
    expect(validateCostShare(0, 70).ok).toBe(true);
  });

  it("refuses anything above the cap", () => {
    const r = validateCostShare(80, 70);
    expect(r.ok === false && r.error.code).toBe("COST_SHARE_EXCEEDS_CAP");
  });
});

describe("validatePublish", () => {
  const now = "2026-09-03T21:00:00+06:00";
  const base = { departureAt: "2026-09-04T07:45:00+06:00", costSharePerSeat: 70, seatsTotal: 3 };

  it("accepts a well-formed ride", () => {
    expect(validatePublish(base, 70, 0, now).ok).toBe(true);
  });

  it("refuses a departure in the past", () => {
    const r = validatePublish({ ...base, departureAt: "2026-09-03T06:00:00+06:00" }, 70, 0, now);
    expect(r.ok === false && r.error.code).toBe("DEPARTURE_IN_PAST");
  });

  it("refuses a seat count that is not a whole number", () => {
    for (const seatsTotal of [0, -2, 2.5]) {
      const r = validatePublish({ ...base, seatsTotal }, 70, 0, now);
      expect(r.ok === false && r.error.code).toBe("INVALID_INPUT");
    }
  });

  it("refuses a cost share above the cap — there is no override anywhere", () => {
    const r = validatePublish({ ...base, costSharePerSeat: 71 }, 70, 0, now);
    expect(r.ok === false && r.error.code).toBe("COST_SHARE_EXCEEDS_CAP");
  });

  it("enforces the daily published-ride cap", () => {
    expect(validatePublish(base, 70, 1, now).ok).toBe(true);
    const r = validatePublish(base, 70, 2, now);
    expect(r.ok === false && r.error.code).toBe("DAILY_RIDE_CAP_REACHED");
  });

  it("honours a configured cap other than the default", () => {
    expect(validatePublish(base, 70, 3, now, 4).ok).toBe(true);
    expect(validatePublish(base, 70, 4, now, 4).ok).toBe(false);
    expect(DEFAULT_DAILY_RIDE_CAP).toBe(2);
  });
});
