import { describe, expect, it } from "vitest";
import { ZONES, zoneById } from "../../adapters/local-json/seed/zones.js";
import { ROAD_DETOUR_FACTOR, ZoneGraph } from "./geo.js";
import { MAX_VIA, orderAlongRoute, pathDistanceKm, suggestVia, viaCandidates } from "./via.js";

/**
 * Every zone in a ride's sequence is a place a colleague can board, so a route
 * with no intermediate stop is a car with one door. These tests pin the fix and,
 * more importantly, pin its limits: this is geometry and the suggestions have to
 * be recognisable to somebody who drives the road.
 */

const graph = new ZoneGraph(ZONES);
const plannerVia = (a: string, b: string): readonly string[] => {
  const r = graph.route(a, b);
  return r ? r.zoneSequence.slice(1, -1) : [];
};
const suggest = (a: string, b: string): readonly string[] => suggestVia(a, b, ZONES, plannerVia(a, b));
const names = (ids: readonly string[]): string[] => ids.map((id) => zoneById(id)?.nameEn ?? id);

describe("somewhere to board on a short journey", () => {
  it("offers stops where the planner found none — the reported bug", () => {
    // Mirpur-10 and Gulshan-2 are 4.9 km apart in a straight line, under the
    // five-kilometre radius at which the zone graph links two places directly.
    // The shortest path was therefore one hop, and the published ride had
    // nowhere for anybody to get in except the very start.
    expect(plannerVia("mirpur-10", "gulshan-2")).toHaveLength(0);
    expect(suggest("mirpur-10", "gulshan-2").length).toBeGreaterThan(0);
  });

  it("never proposes more than three", () => {
    // The driver's own limit: more than three is a list to manage, not a route.
    for (const [a, b] of [
      ["uttara", "motijheel"],
      ["narayanganj", "savar"],
      ["gazipur", "dhanmondi"],
      ["mirpur-12", "sadarghat"],
    ] as const) {
      expect(suggest(a, b).length).toBeLessThanOrEqual(MAX_VIA);
    }
  });

  it("keeps what the planner found, rather than second-guessing it", () => {
    // Those zones came off the road graph. Overruling them with a straight line
    // is how a suggestion stops resembling the route computed directly above it
    // on the same screen.
    const planner = plannerVia("uttara", "gulshan-2");
    expect(planner.length).toBeGreaterThan(0);
    for (const z of planner) expect(suggest("uttara", "gulshan-2")).toContain(z);
  });

  it("orders stops along the journey, not by how good they are", () => {
    const via = suggest("mirpur-12", "gulshan-2");
    expect(names(via)).toEqual(names(orderAlongRoute("mirpur-12", "gulshan-2", via, ZONES)));
  });
});

describe("what it refuses to suggest", () => {
  it("rejects a place on the wrong side of the city", () => {
    // Uttara to Gulshan-2 by way of Mirpur-12 costs only 20% by the sum of two
    // legs, which the detour ratio alone accepts — and it is across Dhaka. The
    // cross-track limit is what catches it.
    expect(suggest("uttara", "gulshan-2")).not.toContain("mirpur-12");
  });

  it("rejects a place that is effectively the destination", () => {
    // Banani is 87% of the way from Motijheel to Gulshan-2. Nobody plans to
    // board there rather than at the end.
    expect(suggest("motijheel", "gulshan-2")).not.toContain("banani");
  });

  it("never proposes either endpoint", () => {
    const via = suggest("uttara", "motijheel");
    expect(via).not.toContain("uttara");
    expect(via).not.toContain("motijheel");
  });

  it("proposes no landmarks of its own, which are the driver's to add", () => {
    /*
      Suggesting "Banani Graveyard" unprompted fills the line with a level of
      detail nobody asked for; typing it is a different matter.

      Asserted on the geometric scan rather than on the whole suggestion,
      because a landmark the *planner* routed through is genuinely on the road
      it computed — Uttara to Gulshan-2 really does pass Jashim Uddin — and
      dropping it would make the stops disagree with the route drawn directly
      above them.
    */
    for (const [a, b] of [["mirpur-10", "gulshan-2"], ["uttara", "motijheel"]] as const) {
      for (const c of viaCandidates(a, b, ZONES)) {
        expect(zoneById(c.zoneId)?.parentId, c.zoneId).toBeUndefined();
      }
    }
  });

  it("returns nothing for a journey that goes nowhere", () => {
    expect(suggestVia("gulshan-2", "gulshan-2", ZONES)).toEqual([]);
    expect(suggestVia("nowhere", "gulshan-2", ZONES)).toEqual([]);
    expect(suggestVia("gulshan-2", "nowhere", ZONES)).toEqual([]);
  });

  it("does not divide by a journey of no length", () => {
    // Two places on top of each other have no "between", and the ratio would be
    // infinite for every candidate.
    expect(viaCandidates("banani", "banani", ZONES)).toEqual([]);
  });
});

describe("the places a driver can name", () => {
  it("knows the landmarks colleagues actually say", () => {
    for (const id of ["mirpur-dohs", "ecb-chattar", "banani-graveyard"]) {
      expect(zoneById(id), id).toBeDefined();
      expect(zoneById(id)?.isLandmark).toBe(true);
    }
  });

  it("accepts one as a stop, even though it would never be suggested", () => {
    const withLandmark = orderAlongRoute("mirpur-12", "gulshan-2", ["ecb-chattar", "kalshi"], ZONES);
    // Ordered along the journey: Kalshi is nearer Mirpur-12 than ECB Chattar.
    expect(withLandmark).toEqual(["kalshi", "ecb-chattar"]);
  });
});

describe("what the journey then measures", () => {
  const direct = pathDistanceKm(["mirpur-10", "gulshan-2"], ZONES, ROAD_DETOUR_FACTOR);

  it("grows when the driver adds a stop off the direct line", () => {
    // The old code scaled the planner's distance by the fraction of suggested
    // stops kept, so adding a stop to a route made it *longer* in proportion to
    // the count rather than the detour — a driver saying "I also pass Agargaon"
    // was quoted a longer trip and charged their passengers more for it.
    const viaAgargaon = pathDistanceKm(["mirpur-10", "agargaon", "gulshan-2"], ZONES, ROAD_DETOUR_FACTOR);
    expect(viaAgargaon).toBeGreaterThan(direct);
  });

  it("barely moves for a stop that really is on the way", () => {
    const viaKazipara = pathDistanceKm(["mirpur-10", "kazipara", "gulshan-2"], ZONES, ROAD_DETOUR_FACTOR);
    expect(viaKazipara / direct).toBeLessThan(1.15);
  });

  it("ignores a place it has never heard of rather than returning NaN", () => {
    expect(pathDistanceKm(["mirpur-10", "atlantis", "gulshan-2"], ZONES, ROAD_DETOUR_FACTOR))
      .toBeCloseTo(direct, 5);
  });

  it("is zero for a single point", () => {
    expect(pathDistanceKm(["gulshan-2"], ZONES, ROAD_DETOUR_FACTOR)).toBe(0);
  });
});
