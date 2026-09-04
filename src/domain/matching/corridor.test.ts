import { describe, expect, it } from "vitest";
import { RideIndex, classifyMatch, scoreMatch, search } from "./corridor.js";
import { ride } from "../../test/factories.js";
import type { SearchQuery } from "./corridor.js";
import type { Ride } from "../entities/ride.js";

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

  it("excludes rides that cannot be travelled on", () => {
    for (const status of ["draft", "cancelled", "completed", "in_progress"] as const) {
      expect(search([ride({ status })], query())).toHaveLength(0);
    }
  });

  it("marks a ride without enough seats rather than dropping it", () => {
    // See "rides with no seat left" below: shown greyed, not hidden.
    expect(search([ride({ seatsAvailable: 1 })], query({ seats: 2 }))[0]?.full).toBe(true);
    expect(search([ride({ seatsAvailable: 2 })], query({ seats: 2 }))[0]?.full).toBe(false);
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
      full: false,
    });
    const near = scoreMatch({
      ride: northbound,
      label: "exact_route",
      boardZoneId: "uttara",
      alightZoneId: "gulshan-2",
      timeDeltaMinutes: 0,
      walkingMinutes: 2,
      full: false,
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
      full: false,
    };
    expect(scoreMatch(base, 100)).toBeGreaterThan(scoreMatch(base, 40));
  });
});

describe("rides with no seat left", () => {
  /*
    Shown, greyed, unbookable — not hidden.

    Dropping them told a rider searching Uttara→Gulshan-2 at 07:45 exactly what
    an empty app tells them: nothing here. Showing the full ride tells them
    somebody does drive this, which is what turns a dead end into "alert me" or
    "I'll drive tomorrow". In week one that is the difference between a colleague
    concluding the app is empty and concluding they were a few minutes late.
  */
  const full = (over: Partial<Ride> = {}) => ride({ seatsAvailable: 0, status: "full", ...over });

  it("still appears in the results", () => {
    const results = search([full()], query());
    expect(results).toHaveLength(1);
    expect(results[0]?.full).toBe(true);
  });

  it("is marked so the screen can grey it out", () => {
    expect(search([ride()], query())[0]?.full).toBe(false);
  });

  it("counts as full when it has seats but not enough of them", () => {
    const results = search([ride({ seatsAvailable: 1 })], { ...query(), seats: 2 });
    expect(results[0]?.full).toBe(true);
  });

  it("never outranks a ride somebody can actually book", () => {
    // Even when the full one is the better match on every other axis: exact
    // time, no walk. A full ride is context, not an option.
    const perfect = full({ id: "full-and-perfect", departureAt: "2026-09-04T07:45:00+06:00" });
    const bookable = ride({ id: "bookable", departureAt: "2026-09-04T08:10:00+06:00" });
    const results = search([perfect, bookable], query());
    expect(results.map((r) => r.ride.id)).toEqual(["bookable", "full-and-perfect"]);
  });

  it("is still excluded once cancelled or completed", () => {
    for (const status of ["cancelled", "completed"] as const) {
      expect(search([full({ status })], query())).toHaveLength(0);
    }
  });
});

describe("RideIndex", () => {
  it("indexes full rides too, or the greyed-out result never reaches the screen", () => {
    // `search` and `RideIndex` filter separately, and the index is the one the
    // app actually calls. Teaching only `search` to keep full rides left the
    // screen exactly as it was.
    const index = new RideIndex([ride({ seatsAvailable: 0, status: "full" })]);
    const results = index.search(query());
    expect(results).toHaveLength(1);
    expect(results[0]?.full).toBe(true);
  });

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

  it("ignores rides that cannot be travelled on", () => {
    // Full is not one of them: it is a match the rider should see, greyed.
    const index = new RideIndex([
      ride({ status: "draft" }),
      ride({ id: "r-2", status: "cancelled" }),
      ride({ id: "r-3", status: "completed" }),
    ]);
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

/**
 * Item 3: any point on a driver's computed route is a legitimate pickup or
 * drop-off. These tests pin that behaviour against a route produced by the zone
 * graph rather than a hand-written sequence, so they fail if routing and
 * matching ever drift apart.
 */
describe("boarding anywhere along a computed route", () => {
  it("matches a rider joining partway and leaving partway", async () => {
    const { ZoneGraphPlanner } = await import("../../adapters/routing/zone-graph.js");
    const { ZONES } = await import("../../adapters/local-json/seed/zones.js");
    const planner = new ZoneGraphPlanner(ZONES);
    const computed = (await planner.plan("uttara", "gulshan-2"))!;

    const driverRide = ride({
      id: "r-computed",
      zoneSequence: computed.zoneSequence,
      distanceKm: computed.distanceKm,
      seatsTotal: 3,
      seatsAvailable: 3,
    });

    // Every ordered pair of stops on the route must be bookable.
    const seq = computed.zoneSequence;
    let pairsChecked = 0;
    for (let i = 0; i < seq.length; i += 1) {
      for (let j = i + 1; j < seq.length; j += 1) {
        const results = search(
          [driverRide],
          query({ originZoneId: seq[i]!, destinationZoneId: seq[j]! }),
        );
        expect(results, `${seq[i]} -> ${seq[j]}`).toHaveLength(1);
        pairsChecked += 1;
      }
    }
    expect(pairsChecked).toBeGreaterThan(2);
  });

  it("still refuses the reverse direction along the same route", async () => {
    const { ZoneGraphPlanner } = await import("../../adapters/routing/zone-graph.js");
    const { ZONES } = await import("../../adapters/local-json/seed/zones.js");
    const planner = new ZoneGraphPlanner(ZONES);
    const computed = (await planner.plan("uttara", "gulshan-2"))!;
    const seq = computed.zoneSequence;

    const driverRide = ride({ id: "r-computed", zoneSequence: seq });
    const results = search(
      [driverRide],
      query({ originZoneId: seq.at(-1)!, destinationZoneId: seq[0]! }),
    );
    expect(results).toHaveLength(0);
  });
});
