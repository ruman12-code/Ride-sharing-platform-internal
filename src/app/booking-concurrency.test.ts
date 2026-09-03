import { describe, expect, it } from "vitest";
import { BookingService } from "./booking-service.js";
import {
  FixedClock,
  InMemoryBookingStore,
  InMemoryRideStore,
  InMemoryUserDirectory,
  LastWriteWinsRideStore,
  RecordingNotifier,
} from "../adapters/local-json/memory-store.js";
import { ride, user } from "../test/factories.js";
import type { RequestSeatInput } from "./booking-service.js";

/**
 * The regression test for the defect that killed the legacy tool.
 *
 * `UserForm1.CommandButton1_Click` read `lastRow`, wrote to `lastRow + 1`, and
 * displayed "Data inserted successfully!" unconditionally. Two colleagues
 * submitting against the same copy wrote the same row: one posting vanished and
 * both users were told it worked (LEGACY_AUDIT.md L-04).
 *
 * The brief requires a test that "must fail before the control exists and pass
 * after". Rather than asking a reader to take that on trust, the same scenario
 * runs against two stores:
 *
 *   LastWriteWinsRideStore — the legacy behaviour, translated to TypeScript
 *   InMemoryRideStore      — the compare-and-swap control
 *
 * and asserts the first oversells the seat while the second does not. If
 * somebody ever weakens the CAS, the second suite fails; if somebody makes this
 * test vacuous, the first suite fails.
 */

const DRIVER = user({ id: "u-driver", displayName: "Rezaul Karim" });
const RIDER_A = user({ id: "u-a", displayName: "Nusrat Jahan" });
const RIDER_B = user({ id: "u-b", displayName: "Tanvir Ahmed" });

const seatRequest = (riderId: string, key: string): RequestSeatInput => ({
  rideId: "ride-1",
  riderId,
  boardZoneId: "khilkhet",
  alightZoneId: "gulshan-2",
  seats: 1,
  counterfactualMode: "bus",
  settlementMode: "credit_ledger",
  idempotencyKey: key,
});

const build = (rides: InMemoryRideStore) => {
  let n = 0;
  const bookings = new InMemoryBookingStore();
  const service = new BookingService({
    rides,
    bookings,
    users: new InMemoryUserDirectory([DRIVER, RIDER_A, RIDER_B]),
    clock: new FixedClock("2026-09-03T21:00:00+06:00"),
    notifier: new RecordingNotifier(),
    newId: () => `bk-${(n += 1)}`,
  });
  return { service, bookings, rides };
};

/**
 * The legacy submit path, translated to TypeScript.
 *
 * `UserForm1.CommandButton1_Click` did exactly this: find the end of the data,
 * write there, report success. It never checked whether a seat remained, never
 * checked whether the row it was about to write had been claimed, and never
 * verified the write landed.
 */
const legacyStyleRequestSeat = async (
  rides: InMemoryRideStore,
  bookings: InMemoryBookingStore,
  riderId: string,
  id: string,
): Promise<{ ok: boolean }> => {
  const ride = await rides.get("ride-1");
  if (!ride) return { ok: false };
  // No seat check. No version check. Just append and declare success --
  // "Data inserted successfully!"
  await bookings.create({
    id,
    rideId: ride.id,
    riderId,
    boardZoneId: "khilkhet",
    alightZoneId: "gulshan-2",
    seats: 1,
    status: "confirmed",
    amount: ride.costSharePerSeat,
    settlementMode: "credit_ledger",
    counterfactualMode: "bus",
    idempotencyKey: id,
    rowVersion: 1,
  });
  await rides.saveWithVersion({ ...ride, seatsAvailable: ride.seatsAvailable - 1 }, ride.rowVersion);
  return { ok: true };
};

describe("two colleagues race for the last seat", () => {
  it("WITHOUT the control (legacy lastRow+1 behaviour): the seat is oversold", async () => {
    const rides = new LastWriteWinsRideStore([ride({ seatsTotal: 1, seatsAvailable: 1 })]);
    rides.interleave = true;
    const bookings = new InMemoryBookingStore();

    const [a, b] = await Promise.all([
      legacyStyleRequestSeat(rides, bookings, "u-a", "bk-a"),
      legacyStyleRequestSeat(rides, bookings, "u-b", "bk-b"),
    ]);

    // Both callers are told they succeeded...
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // ...and the single seat has been sold twice, with no error anywhere.
    expect(await bookings.listForRide("ride-1")).toHaveLength(2);
    const after = await rides.get("ride-1");
    expect(after?.seatsAvailable).toBe(0); // says one seat sold; two bookings exist
  });

  it("WITH the control: exactly one succeeds and the other is told the seat went", async () => {
    const rides = new InMemoryRideStore([ride({ seatsTotal: 1, seatsAvailable: 1 })]);
    rides.interleave = true;
    const { service, bookings } = build(rides);

    const results = await Promise.all([
      service.requestSeat(seatRequest("u-a", "key-a")),
      service.requestSeat(seatRequest("u-b", "key-b")),
    ]);

    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // The loser gets a real, renderable outcome — never a silent drop.
    const error = failed[0]!.ok === false ? failed[0]!.error : undefined;
    expect(error?.code).toMatch(/SEAT_TAKEN|CONCURRENCY_CONFLICT|INSUFFICIENT_SEATS/);
    expect(error?.message).toBeTruthy();

    // And the seat is sold exactly once.
    expect(await bookings.listForRide("ride-1")).toHaveLength(1);
    expect(await service.seatsAvailable("ride-1")).toBe(0);
  });

  it("holds when eight colleagues race for three seats", async () => {
    const rides = new InMemoryRideStore([ride({ seatsTotal: 3, seatsAvailable: 3 })]);
    rides.interleave = true;
    let n = 0;
    const bookings = new InMemoryBookingStore();
    const riders = Array.from({ length: 8 }, (_, i) => user({ id: `r-${i}` }));
    const service = new BookingService({
      rides,
      bookings,
      users: new InMemoryUserDirectory([DRIVER, ...riders]),
      clock: new FixedClock("2026-09-03T21:00:00+06:00"),
      notifier: new RecordingNotifier(),
      newId: () => `bk-${(n += 1)}`,
    });

    const results = await Promise.all(
      riders.map((r) => service.requestSeat(seatRequest(r.id, `key-${r.id}`))),
    );

    // At most three win. Some losers may hit a conflict rather than a full
    // house, which is why this asserts "no oversell" rather than "exactly 3".
    const won = results.filter((r) => r.ok).length;
    expect(won).toBeLessThanOrEqual(3);
    expect(won).toBeGreaterThan(0);
    expect(await service.seatsAvailable("ride-1")).toBeGreaterThanOrEqual(0);
    expect((await bookings.listForRide("ride-1")).length).toBe(won);
  });
});

describe("idempotency", () => {
  it("a double-tap on a slow connection creates one booking, not two", async () => {
    const rides = new InMemoryRideStore([ride({ seatsTotal: 2, seatsAvailable: 2 })]);
    const { service, bookings } = build(rides);

    const first = await service.requestSeat(seatRequest("u-a", "same-key"));
    const second = await service.requestSeat(seatRequest("u-a", "same-key"));

    expect(first.ok && second.ok).toBe(true);
    expect(first.ok && second.ok && first.value.id).toBe(second.ok ? second.value.id : "");
    expect(await bookings.listForRide("ride-1")).toHaveLength(1);
    expect(await service.seatsAvailable("ride-1")).toBe(1);
  });

  it("different keys from the same rider are different requests", async () => {
    const rides = new InMemoryRideStore([ride({ seatsTotal: 2, seatsAvailable: 2 })]);
    const { service } = build(rides);
    await service.requestSeat(seatRequest("u-a", "key-1"));
    const second = await service.requestSeat(seatRequest("u-a", "key-2"));
    // Blocked by the one-ride-per-day rule rather than silently duplicated.
    expect(second.ok).toBe(false);
  });
});
