import type { Route } from "../../domain/matching/geo.js";
import type { RoutePlanner } from "../../ports/routing.js";
import type { Id } from "../../domain/types.js";

/**
 * A precomputed route table. **The answer to the third-party privacy problem.**
 *
 * The concern with a live routing API was never the geometry — it was that
 * every call is a fresh disclosure, and over weeks of commutes those calls
 * accumulate into a record of who travels where and when.
 *
 * This removes the accumulation by removing the calls. An administrator runs
 * `tools/build-route-table.ts` once, offline. It asks the routing provider for
 * the distance between each pair of **zone centroids** — public landmarks, not
 * anybody's address — and writes the answers to a file that ships with the app.
 * At runtime the app reads that file. It never contacts anyone.
 *
 * What the provider therefore learns:
 *   - a fixed list of place-to-place queries between public landmarks
 *   - no colleague, no identity, no timestamp tied to a person
 *   - nothing repeated: each pair is asked once, ever
 *
 * What it cannot learn: that anybody commutes anywhere. Which is the entire
 * point, and is why this is a better answer than "ask the user's permission" —
 * it makes the permission unnecessary rather than shifting the risk onto them.
 *
 * The table is bounded: 45 zones is at most 45 × 44 = 1,980 ordered pairs, and
 * in practice far fewer because only plausible pairs are generated.
 */
export interface RouteTableEntry {
  readonly from: Id;
  readonly to: Id;
  readonly zoneSequence: readonly Id[];
  readonly distanceKm: number;
  readonly durationMinutes: number;
}

export interface RouteTable {
  /** Which provider produced the figures, recorded for provenance. */
  readonly provider: "zone-graph" | "google-directions";
  readonly generatedAt: string;
  readonly zoneCount: number;
  readonly entries: readonly RouteTableEntry[];
}

/**
 * Serves routes from the shipped table, falling back for any pair it lacks.
 *
 * The fallback matters: a table generated before a zone was added would
 * otherwise make that zone unusable. Degrading to the local graph keeps every
 * journey possible, and the `isEstimate` flag tells the interface which kind of
 * number it is showing.
 */
export class RouteTablePlanner implements RoutePlanner {
  readonly name: "zone-graph" | "google-directions";
  private readonly index = new Map<string, RouteTableEntry>();

  constructor(
    private readonly table: RouteTable,
    private readonly fallback: RoutePlanner,
  ) {
    this.name = table.provider;
    for (const e of table.entries) this.index.set(`${e.from}>${e.to}`, e);
  }

  async plan(originZoneId: Id, destinationZoneId: Id): Promise<Route | undefined> {
    const hit = this.index.get(`${originZoneId}>${destinationZoneId}`);
    if (!hit) return this.fallback.plan(originZoneId, destinationZoneId);

    const legs = [];
    const hops = Math.max(1, hit.zoneSequence.length - 1);
    const per = Math.round((hit.distanceKm / hops) * 10) / 10;
    for (let i = 0; i + 1 < hit.zoneSequence.length; i += 1) {
      legs.push({
        fromZoneId: hit.zoneSequence[i]!,
        toZoneId: hit.zoneSequence[i + 1]!,
        distanceKm: per,
      });
    }

    return {
      zoneSequence: hit.zoneSequence,
      legs,
      distanceKm: hit.distanceKm,
      durationMinutes: hit.durationMinutes,
      provider: this.table.provider,
      // A table built from real road geometry is not an estimate. One built
      // from the local graph still is, and says so.
      isEstimate: this.table.provider === "zone-graph",
    };
  }

  /** How much of the zone set the table actually covers. */
  coverage(): { readonly pairs: number; readonly zones: number } {
    return { pairs: this.index.size, zones: this.table.zoneCount };
  }
}
