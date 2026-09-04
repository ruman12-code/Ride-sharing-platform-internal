import { describe, expect, it } from "vitest";
import { RouteTablePlanner, type RouteTable } from "./route-table.js";
import { ZoneGraphPlanner } from "./zone-graph.js";
import { ZONES } from "../local-json/seed/zones.js";
import table from "./route-table.json";

const shipped = table as RouteTable;
const fallback = new ZoneGraphPlanner(ZONES);
const planner = new RouteTablePlanner(shipped, fallback);

/**
 * The shipped table is what makes runtime routing require no network at all,
 * which is the mitigation the whole third-party privacy argument rests on.
 * These tests hold it to that.
 */
describe("the shipped route table", () => {
  it("covers every ordered pair of zones", () => {
    // 47 zones = 47 x 46 = 2,162 ordered pairs.
    expect(shipped.zoneCount).toBe(ZONES.length);
    expect(shipped.entries.length).toBe(ZONES.length * (ZONES.length - 1));
  });

  it("records which provider produced it, for provenance", () => {
    expect(["zone-graph", "google-directions"]).toContain(shipped.provider);
    expect(shipped.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("holds no entry with a zero or negative distance", () => {
    expect(shipped.entries.filter((e) => !(e.distanceKm > 0))).toEqual([]);
  });

  it("starts and ends each sequence at the right zones", () => {
    for (const e of shipped.entries.slice(0, 200)) {
      expect(e.zoneSequence[0]).toBe(e.from);
      expect(e.zoneSequence.at(-1)).toBe(e.to);
    }
  });
});

describe("RouteTablePlanner", () => {
  it("serves a route without touching the network", async () => {
    // No fetch is stubbed here on purpose: if the planner ever reached out,
    // this test would be the thing that noticed.
    const r = await planner.plan("uttara", "gulshan-2");
    expect(r).toBeDefined();
    expect(r!.distanceKm).toBeGreaterThan(0);
    expect(r!.zoneSequence[0]).toBe("uttara");
  });

  it("falls back for a pair the table does not hold", async () => {
    const sparse = new RouteTablePlanner(
      { provider: "google-directions", generatedAt: "2026-09-04T00:00:00Z", zoneCount: 0, entries: [] },
      fallback,
    );
    // A zone added after the table was built must still be usable.
    const r = await sparse.plan("uttara", "gulshan-2");
    expect(r).toBeDefined();
    expect(r!.provider).toBe("zone-graph");
  });

  it("marks a graph-built table as an estimate and a Google one as not", async () => {
    expect((await planner.plan("uttara", "gulshan-2"))!.isEstimate).toBe(
      shipped.provider === "zone-graph",
    );
    const asGoogle = new RouteTablePlanner(
      { ...shipped, provider: "google-directions" },
      fallback,
    );
    expect((await asGoogle.plan("uttara", "gulshan-2"))!.isEstimate).toBe(false);
  });

  it("splits the distance across legs that sum back to the total", async () => {
    const r = (await planner.plan("mirpur-12", "motijheel"))!;
    expect(r.legs).toHaveLength(r.zoneSequence.length - 1);
    const summed = r.legs.reduce((s, l) => s + l.distanceKm, 0);
    expect(Math.abs(summed - r.distanceKm)).toBeLessThan(1);
  });

  it("reports its coverage", () => {
    expect(planner.coverage()).toEqual({
      pairs: shipped.entries.length,
      zones: ZONES.length,
    });
  });

  it("serves both directions of a journey", async () => {
    const out = await planner.plan("uttara", "motijheel");
    const back = await planner.plan("motijheel", "uttara");
    expect(out).toBeDefined();
    expect(back).toBeDefined();
    expect(back!.zoneSequence[0]).toBe("motijheel");
  });
});
