import type { Zone } from "../../domain/entities/zone.js";
import { ZoneGraph, type Route } from "../../domain/matching/geo.js";
import type { RoutePlanner } from "../../ports/routing.js";
import type { Id } from "../../domain/types.js";

/**
 * The default planner. Computes routes from zone geography, locally.
 *
 * Nothing leaves the tenant, nothing is metered, and it works with no network.
 * Distances are straight-line scaled by a detour factor, so they are estimates
 * and are labelled as such wherever they appear.
 */
export class ZoneGraphPlanner implements RoutePlanner {
  readonly name = "zone-graph" as const;
  private readonly graph: ZoneGraph;
  private readonly cache = new Map<string, Route | undefined>();

  constructor(zones: readonly Zone[]) {
    this.graph = new ZoneGraph(zones);
  }

  async plan(originZoneId: Id, destinationZoneId: Id): Promise<Route | undefined> {
    const key = `${originZoneId}>${destinationZoneId}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const route = this.graph.route(originZoneId, destinationZoneId);
    this.cache.set(key, route);
    return route;
  }
}
