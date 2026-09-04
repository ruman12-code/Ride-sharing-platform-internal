import type { Zone } from "../entities/zone.js";
import type { Id } from "../types.js";

/**
 * Geographic routing over the zone set.
 *
 * There are no pre-defined corridors. A colleague picks any origin and any
 * destination, and the route between them is computed — so a journey nobody
 * anticipated works exactly as well as the three everybody expected.
 *
 * Straight-line distance is scaled by a detour factor to approximate road
 * distance. That is an approximation and is labelled as one everywhere it
 * surfaces; the Google adapter replaces it with real road geometry when the
 * organisation chooses to enable it.
 */

const EARTH_RADIUS_KM = 6371;

export const haversineKm = (
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

/**
 * Road distance ÷ straight-line distance in dense Dhaka.
 *
 * Roads do not run in straight lines and the river-and-rail geography here
 * forces long detours. 1.35 is a conservative mid-range urban figure; it is a
 * stated assumption, not a measurement, and every cost share computed from it
 * carries the "estimated" label in the interface.
 */
export const ROAD_DETOUR_FACTOR = 1.35;

/** Zones within this straight-line distance are considered directly connected. */
export const NEIGHBOUR_RADIUS_KM = 5;

/** Every zone links to at least this many nearest neighbours, so the graph connects. */
export const MIN_NEIGHBOURS = 4;

export interface RouteLeg {
  readonly fromZoneId: Id;
  readonly toZoneId: Id;
  readonly distanceKm: number;
}

export interface Route {
  /** Ordered. Every zone here is a legitimate boarding or alighting point. */
  readonly zoneSequence: readonly Id[];
  readonly legs: readonly RouteLeg[];
  readonly distanceKm: number;
  readonly durationMinutes: number;
  /** Which planner produced this, so the interface can say how it was measured. */
  readonly provider: "zone-graph" | "google-directions";
  /** True when distance is derived from a detour factor rather than road geometry. */
  readonly isEstimate: boolean;
}

/**
 * Average Dhaka peak-hour speed, km/h.
 *
 * Widely reported at roughly 5–7 km/h in the worst central congestion and
 * 15–20 km/h on the northern arterials. 12 is a deliberately unglamorous
 * middle. It affects only the displayed travel time, never the cost share.
 */
export const AVERAGE_SPEED_KMH = 12;

/** Adjacency built from geography alone. No hand-maintained corridor list. */
export class ZoneGraph {
  private readonly adjacency = new Map<Id, { to: Id; km: number }[]>();
  private readonly zones = new Map<Id, Zone>();

  constructor(zones: readonly Zone[]) {
    for (const z of zones) this.zones.set(z.id, z);
    for (const z of zones) this.adjacency.set(z.id, []);

    // The graph is UNDIRECTED: every link is added in both directions.
    //
    // An earlier version added each zone's nearest neighbours one way only, and
    // the outer districts fell off the map. Narayanganj linked inward to
    // Jatrabari, but Jatrabari's own neighbours were all within 5 km and did not
    // include Narayanganj 11.6 km away — so a colleague could drive out of
    // Narayanganj and never drive back into it. Roads do not work that way.
    const link = (a: Id, b: Id, km: number) => {
      const forward = this.adjacency.get(a)!;
      if (!forward.some((e) => e.to === b)) forward.push({ to: b, km });
      const back = this.adjacency.get(b)!;
      if (!back.some((e) => e.to === a)) back.push({ to: a, km });
    };

    for (const from of zones) {
      const ranked = zones
        .filter((z) => z.id !== from.id)
        .map((to) => ({ to: to.id, km: haversineKm(from, to) }))
        .sort((a, b) => a.km - b.km);

      // Everything within the radius, and always at least MIN_NEIGHBOURS, so an
      // outlying zone such as Savar or Narayanganj is never stranded.
      const near = ranked.filter((r) => r.km <= NEIGHBOUR_RADIUS_KM);
      const links = near.length >= MIN_NEIGHBOURS ? near : ranked.slice(0, MIN_NEIGHBOURS);
      for (const edge of links) link(from.id, edge.to, edge.km);
    }
  }

  neighbours(id: Id): readonly { readonly to: Id; readonly km: number }[] {
    return this.adjacency.get(id) ?? [];
  }

  has(id: Id): boolean {
    return this.zones.has(id);
  }

  /**
   * Shortest path by Dijkstra, weighted by straight-line distance.
   *
   * Returns undefined rather than a partial route when no path exists: a
   * half-route would silently mis-price the trip and offer stops the driver
   * never passes.
   */
  route(originId: Id, destinationId: Id): Route | undefined {
    if (!this.has(originId) || !this.has(destinationId)) return undefined;
    if (originId === destinationId) return undefined;

    const dist = new Map<Id, number>([[originId, 0]]);
    const prev = new Map<Id, Id>();
    const settled = new Set<Id>();
    // A linear scan for the minimum is fine at this scale: the zone set is in
    // the dozens, and a heap here would be complexity with nothing to show.
    const pending = new Set<Id>([originId]);

    while (pending.size > 0) {
      let current: Id | undefined;
      let best = Infinity;
      for (const id of pending) {
        const d = dist.get(id) ?? Infinity;
        if (d < best) {
          best = d;
          current = id;
        }
      }
      if (current === undefined) break;
      pending.delete(current);
      settled.add(current);
      if (current === destinationId) break;

      for (const edge of this.neighbours(current)) {
        if (settled.has(edge.to)) continue;
        const candidate = best + edge.km;
        if (candidate < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, candidate);
          prev.set(edge.to, current);
          pending.add(edge.to);
        }
      }
    }

    if (!settled.has(destinationId)) return undefined;

    const zoneSequence: Id[] = [destinationId];
    for (let at = destinationId; prev.has(at); ) {
      at = prev.get(at)!;
      zoneSequence.unshift(at);
    }

    const legs: RouteLeg[] = [];
    for (let i = 0; i + 1 < zoneSequence.length; i += 1) {
      const from = this.zones.get(zoneSequence[i]!)!;
      const to = this.zones.get(zoneSequence[i + 1]!)!;
      legs.push({
        fromZoneId: from.id,
        toZoneId: to.id,
        distanceKm: round1(haversineKm(from, to) * ROAD_DETOUR_FACTOR),
      });
    }

    const distanceKm = round1(legs.reduce((sum, l) => sum + l.distanceKm, 0));
    return {
      zoneSequence,
      legs,
      distanceKm,
      durationMinutes: Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60),
      provider: "zone-graph",
      isEstimate: true,
    };
  }
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;
