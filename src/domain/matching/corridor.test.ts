import { describe, expect, it } from "vitest";
import { RideIndex, classifyMatch, scoreMatch, search } from "./corridor.js";
import { ride } from "../../test/factories.js";
import type { SearchQuery } from "./corridor.js";

// Uttara -> Khilkhet -> Banani -> Gulshan-2, departing 07:45.
const northbound = ride({ id: "r-north" });

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  originZoneId: "uttara",
  destinationZoneId: "gulshan-2",
  targetTime: "2026-09-04T07:45:00+06:00",
  windowMinutes: 30,
  seats: 1,
  ...over,
});

describe("classifyMatch", () => {
  it("labels a whole-route match exact", () => {
    expect(classifyMatch(northbound, "uttara", "gulshan-2")).toBe("exact_route");
  });

  it("labels a match sharing one endpoint as on the way", () => {
    expect(classifyMatch(northbound, "uttara", "banani")).toBe("on_the_way");
    expect(classifyMatch(northbound, "khilkhet", "gulshan-2")).toBe("on_the_way");
  });

  it("labels a wholly-intermediate match a short detour", () => {
    expect(classifyMatch(northbound, "khilkhet", "banani")).toBe("short_detour");
  });

  it("refuses a journey against the direction of travel", () => {
    // The single most important thing the legacy origin-only search could not do.
    expect(classifyMatch(northbound, "gulshan-2", "uttara")).toBeUndefined();
    expect(classifyMatch(northbound, "banani", "khilkhet")).toBeUndefined();
  });

  it("refuses a zone that is not on the route", () => {
    expect(classifyMatch(northbound, "mirpur-10", "gulshan-2")).toBeUndefined();
    expect(classifyMatch(northbound, "uttara", "dhanmondi")).toBeUndefined();
  });

  it("refuses a journey that starts and ends in the same zone", () => {
    expect(classifyMatch(northbound, "banani", "banani")).toBeUndefined();
  });
});

describe("search filters", () => {
  it("finds a ride inside the time window", () => {
    expect(search([northbound], query())).toHaveLength(1);
    expect(search([northbound], query({ targetTime: "2026-09-04T08:15:00+06:00" }))).toHaveLength(1);
    expect(search([northbound], query({ targetTime: "2026-09-04T07:15:00+06:00" }))).toHaveLength(1);
  });

  it("excludes a ride outside the time window", () => {
    expect(search([northbound], query({ targetTime: "2026-09-04T08:16:00+06:00" }))).toHaveLength(0);
    expect(search([northbound], query({ targetTime: "2026-09-04T06:00:00+06:00" }))).toHaveLength(0);
  });

  it("excludes a ride on a different date at the same clock time", () => {
    expect(search([northbound], query({ targetTime: "2026-09-05T07:45:00+06:00" }))).toHaveLength(0);
  });

  it("excludes rides that are not published", () => {
    for (const status of ["draft", "full", "cancelled", "completed", "in_progress"] as const) {
      expect(search([ride({ status })], query())).toHaveLength(0);
    }
  });

  it("excludes rides without enough seats", () => {
    expect(search([ride({ seatsAvailable: 1 })], query({ seats: 2 }))).toHaveLength(0);
    expect(search([ride({ seatsAvailable: 2 })], query({ seats: 2 }))).toHaveLength(1);
  });

  it("never returns the searcher's own ride", () => {
    expect(search([northbound], query({ riderId: "u-driver" }))).toHaveLength(0);
    expect(search([northbound], query({ riderId: "u-someone-else" }))).toHaveLength(1);
  });

  it("reports the walking minutes from the matching pickup point", () => {
    const results = search([northbound], query({ originZoneId: "khilkhet" }));
    expect(results[0]?.walkingMinutes).toBe(4);
  });

  it("falls back to a default walk when no pickup point covers the zone", () => {
    expect(search([northbound], query())[0]?.walkingMinutes).toBe(10);
  });
});

describe("ranking", () => {
  it("puts match quality above time proximity", () => {
    const exactButLater = ride({
      id: "exact",
      departureAt: "2026-09-04T08:10:00+06:00",
      zoneSequence: ["uttara", "gulshan-2"],
    });
    const detourButPunctual = ride({
      id: "detour",
      departureAt: "2026-09-04T07:45:00+06:00",
      zoneSequence: ["airport", "uttara", "gulshan-2", "dhanmondi"],
    });
    const results = search([detourButPunctual, exactButLater], query());
    expect(results.map((r) => r.ride.id)).toEqual(["exact", "detour"]);
  });

  it("prefers the closer departure among equally good matches", () => {
    const early = ride({ id: "early", departureAt: "2026-09-04T07:20:00+06:00" });
    const punctual = ride({ id: "punctual", departureAt: "2026-09-04T07:45:00+06:00" });
    const results = search([early, punctual], query());
    expect(results[0]?.ride.id).toBe("punctual");
  });

  it("prefers a shorter walk when everything else ties", () => {
    const far = scoreMatch({
      ride: northbound,
      label: "exact_route",
      boardZoneId: "uttara",
      alightZoneId: "gulshan-2",
      timeDeltaMinutes: 0,
      walkingMinutes: 25,
    });
    const near = scoreMatch({
      ride: northbound,
      label: "exact_route",
      boardZoneId: "uttara",
      alightZoneId: "gulshan-2",
      timeDeltaMinutes: 0,
      walkingMinutes: 2,
    });
    expect(near).toBeGreaterThan(far);
  });

  it("prefers a more reliable driver when match and time tie", () => {
    const base = {
      ride: northbound,
      label: "exact_route" as const,
      boardZoneId: "uttara",
      alightZoneId: "gulshan-2",
      timeDeltaMinutes: 10,
      walkingMinutes: 5,
    };
    expect(scoreMatch(base, 100)).toBeGreaterThan(scoreMatch(base, 40));
  });
});

describe("RideIndex", () => {
  it("returns the same results as a full scan", () => {
    const rides = [
      northbound,
      ride({ id: "r-2", departureAt: "2026-09-04T07:50:00+06:00" }),
      ride({ id: "r-3", zoneSequence: ["mirpur-10", "kazipara", "agargaon", "gulshan-2"] }),
      ride({ id: "r-4", departureAt: "2026-09-05T07:45:00+06:00" }),
    ];
    const index = new RideIndex(rides);
    expect(index.search(query()).map((r) => r.ride.id)).toEqual(
      search(rides, query()).map((r) => r.ride.id),
    );
  });

  it("narrows the candidate set instead of scanning every ride", () => {
    const rides = Array.from({ length: 500 }, (_, i) =>
      ride({
        id: `r-${i}`,
        zoneSequence: i % 2 === 0 ? ["mirpur-10", "gulshan-2"] : ["uttara", "gulshan-2"],
      }),
    );
    const index = new RideIndex(rides);
    expect(index.candidates(query()).length).toBe(250);
    expect(index.candidates(query()).length).toBeLessThan(rides.length);
  });

  it("ignores unpublished rides entirely", () => {
    const index = new RideIndex([ride({ status: "draft" }), ride({ id: "r-2", status: "full" })]);
    expect(index.candidates(query())).toHaveLength(0);
  });

  it("returns nothing for a date it holds no rides for", () => {
    const index = new RideIndex([northbound]);
    expect(index.candidates(query({ targetTime: "2027-01-01T07:45:00+06:00" }))).toHaveLength(0);
  });

  it("returns nothing for a zone it holds no rides for", () => {
    const index = new RideIndex([northbound]);
    expect(index.candidates(query({ originZoneId: "savar" }))).toHaveLength(0);
  });
});

describe("zero results", () => {
  it("is a normal outcome, not an error", () => {
    // Zero-result searches are the demand map. They must return cleanly so the
    // caller can log the parameters and offer "Alert me".
    expect(search([], query())).toEqual([]);
    expect(search([northbound], query({ originZoneId: "savar" }))).toEqual([]);
  });
});
