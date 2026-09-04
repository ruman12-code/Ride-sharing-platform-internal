import { describe, expect, it } from "vitest";
import { AVERAGE_SPEED_KMH, ROAD_DETOUR_FACTOR, ZoneGraph, haversineKm } from "./geo.js";
import { ZONES } from "../../adapters/local-json/seed/zones.js";

const graph = new ZoneGraph(ZONES);
const zone = (id: string) => ZONES.find((z) => z.id === id)!;

describe("haversineKm", () => {
  it("measures real Dhaka distances", () => {
    // Uttara to Gulshan-2 is roughly 9-10 km straight line.
    const d = haversineKm(zone("uttara"), zone("gulshan-2"));
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(12);
  });

  it("is zero for a zone against itself, and symmetric", () => {
    expect(haversineKm(zone("banani"), zone("banani"))).toBe(0);
    expect(haversineKm(zone("uttara"), zone("mirpur-10"))).toBeCloseTo(
      haversineKm(zone("mirpur-10"), zone("uttara")),
      6,
    );
  });
});

describe("very short journeys", () => {
  it("never reports a zero distance, however close two places are", () => {
    // A zero-kilometre route reaches calculateCostShare, which correctly
    // refuses a non-positive distance -- so the offer flow would fail on a
    // journey that is merely short rather than impossible.
    const routes = ZONES.flatMap((a) =>
      ZONES.filter((b) => b.id !== a.id).map((b) => graph.route(a.id, b.id)),
    ).filter((r): r is NonNullable<typeof r> => r !== undefined);
    expect(routes.filter((r) => !(r.distanceKm > 0))).toEqual([]);
    expect(routes.every((r) => r.legs.every((l) => l.distanceKm > 0))).toBe(true);
  });
});

describe("directional connectivity", () => {
  it("lets a route leave a dense cluster in the direction it needs", () => {
    // Everything in Uttara is within a few km of everything else, while the
    // nearest zone westward is 6.4 km away. Without a link per compass
    // quadrant, no Uttara route could reach Mirpur without first travelling
    // south-east and doubling back.
    const west = graph.route("uttara-diabari", "mirpur-10")!;
    expect(west.zoneSequence).not.toContain("uttara-jashimuddin");
    expect(west.distanceKm).toBeLessThan(13);

    // And an eastward journey from the same place still goes east.
    const east = graph.route("uttara-diabari", "gulshan-2")!;
    expect(east.zoneSequence).toContain("kuril");
  });

  it("routes landmarks in one area differently, because they are apart", () => {
    // The reason landmarks are routing nodes rather than labels.
    const diabari = graph.route("uttara-diabari", "gulshan-2")!;
    const jashim = graph.route("uttara-jashimuddin", "gulshan-2")!;
    expect(diabari.distanceKm).not.toBe(jashim.distanceKm);
    expect(diabari.distanceKm).toBeGreaterThan(jashim.distanceKm);
  });
});

describe("ZoneGraph routing", () => {
  it("routes between any two zones, with no corridor list involved", () => {
    // The point of removing corridors: a journey nobody anticipated works.
    const r = graph.route("savar", "narayanganj");
    expect(r).toBeDefined();
    expect(r!.zoneSequence[0]).toBe("savar");
    expect(r!.zoneSequence.at(-1)).toBe("narayanganj");
    expect(r!.distanceKm).toBeGreaterThan(0);
  });

  it("routes the three commutes the sponsor named", () => {
    for (const [from, to] of [
      ["uttara", "gulshan-2"],
      ["mirpur-10", "gulshan-2"],
      ["gulshan-1", "mohammadpur"],
    ] as const) {
      const r = graph.route(from, to);
      expect(r, `${from} -> ${to}`).toBeDefined();
      expect(r!.zoneSequence.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("passes through intermediate zones, each a boarding point", () => {
    const r = graph.route("uttara", "gulshan-2")!;
    expect(r.zoneSequence.length).toBeGreaterThan(2);
    expect(r.zoneSequence).toContain("uttara");
    expect(r.zoneSequence).toContain("gulshan-2");
  });

  it("never repeats a zone", () => {
    const r = graph.route("mirpur-12", "sadarghat")!;
    expect(new Set(r.zoneSequence).size).toBe(r.zoneSequence.length);
  });

  it("produces one leg fewer than it has stops, summing to the total", () => {
    const r = graph.route("uttara", "dhanmondi")!;
    expect(r.legs).toHaveLength(r.zoneSequence.length - 1);
    const summed = r.legs.reduce((s, l) => s + l.distanceKm, 0);
    expect(Math.abs(summed - r.distanceKm)).toBeLessThan(0.5);
  });

  it("gives a road distance longer than the straight line", () => {
    const r = graph.route("uttara", "gulshan-2")!;
    expect(r.distanceKm).toBeGreaterThan(haversineKm(zone("uttara"), zone("gulshan-2")));
    expect(ROAD_DETOUR_FACTOR).toBe(1.35);
  });

  it("estimates a duration from the distance", () => {
    const r = graph.route("uttara", "gulshan-2")!;
    expect(r.durationMinutes).toBe(Math.round((r.distanceKm / AVERAGE_SPEED_KMH) * 60));
    expect(r.durationMinutes).toBeGreaterThan(0);
  });

  it("labels itself as an estimate, so the interface can say so", () => {
    expect(graph.route("uttara", "gulshan-2")!.provider).toBe("zone-graph");
    expect(graph.route("uttara", "gulshan-2")!.isEstimate).toBe(true);
  });

  it("refuses a journey to nowhere rather than returning half a route", () => {
    expect(graph.route("uttara", "uttara")).toBeUndefined();
    expect(graph.route("uttara", "atlantis")).toBeUndefined();
    expect(graph.route("atlantis", "uttara")).toBeUndefined();
  });

  it("reaches every zone from every other zone", () => {
    // An unreachable zone would be a place a colleague could pick and then be
    // told no route exists, which reads as a broken app.
    const ids = ZONES.map((z) => z.id);
    const unreachable: string[] = [];
    for (const to of ids) {
      if (to === "uttara") continue;
      if (!graph.route("uttara", to)) unreachable.push(to);
    }
    expect(unreachable).toEqual([]);
  });

  it("takes a sane path rather than a wild detour", () => {
    // Routed distance should stay within a reasonable multiple of straight line.
    for (const [from, to] of [
      ["uttara", "gulshan-2"],
      ["mirpur-10", "motijheel"],
      ["gazipur", "dhanmondi"],
    ] as const) {
      const r = graph.route(from, to)!;
      const direct = haversineKm(zone(from), zone(to));
      expect(r.distanceKm / direct).toBeLessThan(2.2);
    }
  });
});
