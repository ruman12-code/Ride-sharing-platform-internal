import { describe, expect, it } from "vitest";
import { HORIZON_DAYS, dayOfWeek, generateRides, occurrenceDates } from "./recurrence.js";
import type { CommuteProfile } from "../entities/ride.js";
import { vehicle } from "../../test/factories.js";

const profile = (over: Partial<CommuteProfile> = {}): CommuteProfile => ({
  id: "cp-1",
  driverId: "u-driver",
  originZoneId: "uttara",
  destinationZoneId: "gulshan-2",
  viaZoneIds: ["khilkhet", "banani"],
  departureWindowStart: "07:45",
  departureWindowEnd: "08:00",
  daysOfWeek: [0, 1, 2, 3, 4], // Sun-Thu
  seatsOffered: 2,
  vehicle: vehicle(),
  isActive: true,
  validUntil: "2027-01-01",
  autoPublish: false,
  ...over,
});

// 2026-09-03 is a Thursday.
const TODAY = "2026-09-03";

describe("dayOfWeek", () => {
  it("reads Dhaka calendar dates", () => {
    expect(dayOfWeek("2026-09-03")).toBe(4); // Thursday
    expect(dayOfWeek("2026-09-04")).toBe(5); // Friday
    expect(dayOfWeek("2026-09-06")).toBe(0); // Sunday
  });
});

describe("occurrenceDates", () => {
  it("starts tomorrow, never today", () => {
    // A ride for a departure that may already have passed is unbookable.
    expect(occurrenceDates(profile(), TODAY)).not.toContain(TODAY);
  });

  it("covers a fortnight of the working week", () => {
    const dates = occurrenceDates(profile(), TODAY);
    expect(dates).toEqual([
      "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10",
      "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17",
    ]);
    // Fri 04, Sat 05, Fri 11, Sat 12 are correctly absent.
    expect(dates).not.toContain("2026-09-04");
    expect(dates).not.toContain("2026-09-12");
  });

  it("honours a profile that runs on other days", () => {
    const dates = occurrenceDates(profile({ daysOfWeek: [6] }), TODAY); // Saturdays
    expect(dates).toEqual(["2026-09-05", "2026-09-12"]);
  });

  it("generates nothing for an inactive profile", () => {
    expect(occurrenceDates(profile({ isActive: false }), TODAY)).toEqual([]);
  });

  it("stops at validUntil", () => {
    const dates = occurrenceDates(profile({ validUntil: "2026-09-09" }), TODAY);
    expect(dates).toEqual(["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"]);
  });

  it("respects a custom horizon", () => {
    // Day 1 and 2 are Fri/Sat; day 3 is the first working Sunday.
    expect(occurrenceDates(profile(), TODAY, 2)).toEqual([]);
    expect(occurrenceDates(profile(), TODAY, 3)).toEqual(["2026-09-06"]);
    expect(occurrenceDates(profile(), TODAY, 4)).toEqual(["2026-09-06", "2026-09-07"]);
    expect(HORIZON_DAYS).toBe(14);
  });
});

describe("generateRides", () => {
  const opts = {
    profile: profile(),
    today: TODAY,
    existingDates: [] as string[],
    costSharePerSeat: 70,
    fuelPriceId: "fp-octane-2026-06",
    fuelRatePerKm: 16.917,
    distanceKm: 14,
    newId: (d: string) => `r-${d}`,
  };

  it("makes one ride per occurrence, at the window start", () => {
    const rides = generateRides(opts);
    expect(rides).toHaveLength(10);
    expect(rides[0]?.departureAt).toBe("2026-09-06T07:45:00+06:00");
    expect(rides[0]?.profileId).toBe("cp-1");
    expect(rides[0]?.zoneSequence).toEqual(["uttara", "khilkhet", "banani", "gulshan-2"]);
    expect(rides[0]?.seatsTotal).toBe(2);
    expect(rides[0]?.seatsAvailable).toBe(2);
  });

  it("stores the fuel price that applied, not a live lookup", () => {
    expect(generateRides(opts)[0]?.fuelPriceId).toBe("fp-octane-2026-06");
  });

  it("drafts rides unless the driver opted into auto-publish", () => {
    // A draft becomes published when the driver taps Yes on the T-14h prompt.
    expect(generateRides(opts)[0]?.status).toBe("draft");
    expect(generateRides({ ...opts, profile: profile({ autoPublish: true }) })[0]?.status).toBe(
      "published",
    );
  });

  it("is idempotent on date, so a daily run never double-publishes", () => {
    const first = generateRides(opts);
    const second = generateRides({ ...opts, existingDates: first.map((r) => r.departureAt.slice(0, 10)) });
    expect(second).toHaveLength(0);
  });

  it("fills only the gap when some dates already exist", () => {
    const rides = generateRides({ ...opts, existingDates: ["2026-09-06", "2026-09-07"] });
    expect(rides).toHaveLength(8);
    expect(rides[0]?.departureAt.slice(0, 10)).toBe("2026-09-08");
  });
});
