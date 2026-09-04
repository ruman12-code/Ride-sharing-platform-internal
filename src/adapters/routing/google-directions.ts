import type { Zone } from "../../domain/entities/zone.js";
import { ROAD_DETOUR_FACTOR, haversineKm, round1, type Route, type RouteLeg } from "../../domain/matching/geo.js";
import type { RoutePlanner } from "../../ports/routing.js";
import type { Id } from "../../domain/types.js";

/**
 * Google Directions planner. **Disabled by default. Read this before enabling.**
 *
 * What it gives you: real road geometry instead of a detour-factor estimate,
 * and live-traffic travel times.
 *
 * What it costs you, and why this is a decision for the organisation rather
 * than a configuration flag:
 *
 *  1. PERSONAL DATA LEAVES THE TENANT. Every call sends a colleague's journey
 *     endpoints to Google. Over a few weeks of commutes that is a record of
 *     where your staff live and when they leave home. Under the Personal Data
 *     Protection Act 2026 this is a processing activity that needs a lawful
 *     basis, a consent scope, and an entry in the DPIA. It is not covered by
 *     the consent the app collects at first launch.
 *  2. IT IS METERED. Directions requests are billed per call. The zone-graph
 *     planner is free and needs no key.
 *  3. IT INTRODUCES A HARD DEPENDENCY. A quota exhaustion, an outage, or a
 *     billing lapse stops colleagues publishing rides. `fallback` exists so
 *     that failure degrades to the local planner rather than to a blank screen.
 *
 * Enabling it requires all three:
 *   - `VITE_GOOGLE_MAPS_API_KEY` in the environment (never committed)
 *   - `VITE_ROUTING_PROVIDER=google`
 *   - the DPIA updated and the consent scope `routing:third-party` recorded
 *
 * The API key must be restricted by referrer and to the Directions API only.
 * An unrestricted key in a browser bundle is a key anyone can spend.
 */
export interface GoogleDirectionsOptions {
  readonly apiKey: string;
  readonly zones: readonly Zone[];
  /** Used when Google fails, so an outage degrades rather than blocks. */
  readonly fallback: RoutePlanner;
  readonly fetchImpl?: typeof fetch;
}

interface GoogleLeg {
  readonly distance?: { readonly value: number };
  readonly duration_in_traffic?: { readonly value: number };
  readonly duration?: { readonly value: number };
}

interface GoogleResponse {
  readonly status: string;
  readonly routes?: readonly {
    readonly legs?: readonly GoogleLeg[];
    readonly overview_polyline?: { readonly points: string };
  }[];
}

export class GoogleDirectionsPlanner implements RoutePlanner {
  readonly name = "google-directions" as const;
  private readonly cache = new Map<string, Route | undefined>();

  constructor(private readonly options: GoogleDirectionsOptions) {
    if (!options.apiKey) throw new Error("GoogleDirectionsPlanner requires an API key");
  }

  async plan(originZoneId: Id, destinationZoneId: Id): Promise<Route | undefined> {
    const key = `${originZoneId}>${destinationZoneId}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const origin = this.options.zones.find((z) => z.id === originZoneId);
    const destination = this.options.zones.find((z) => z.id === destinationZoneId);
    if (!origin || !destination) return undefined;

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
      url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
      url.searchParams.set("departure_time", "now");
      url.searchParams.set("region", "bd");
      url.searchParams.set("key", this.options.apiKey);

      const doFetch = this.options.fetchImpl ?? fetch;
      const res = await doFetch(url.toString());
      if (!res.ok) throw new Error(`Directions API HTTP ${res.status}`);
      const body = (await res.json()) as GoogleResponse;
      if (body.status !== "OK" || !body.routes?.[0]) {
        throw new Error(`Directions API status ${body.status}`);
      }

      const legs = body.routes[0].legs ?? [];
      const metres = legs.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0);
      const seconds = legs.reduce(
        (sum, l) => sum + (l.duration_in_traffic?.value ?? l.duration?.value ?? 0),
        0,
      );
      if (metres === 0) throw new Error("Directions API returned no distance");

      // Zones the road route passes near become boarding and alighting points.
      const zoneSequence = this.zonesAlong(origin, destination);
      const route: Route = {
        zoneSequence,
        legs: this.legsFor(zoneSequence, metres / 1000),
        distanceKm: round1(metres / 1000),
        durationMinutes: Math.round(seconds / 60),
        provider: "google-directions",
        isEstimate: false,
      };
      this.cache.set(key, route);
      return route;
    } catch {
      // Degrade to the local planner. A routing outage must not stop a
      // colleague publishing a ride.
      return this.options.fallback.plan(originZoneId, destinationZoneId);
    }
  }

  /**
   * Zones lying near the straight line between the endpoints, in travel order.
   *
   * A deliberate approximation of polyline snapping: decoding the overview
   * polyline and testing each zone against it would be more precise, and is the
   * obvious next step, but the corridor of interest here is wide (a colleague
   * will walk a few hundred metres to a pickup) and this keeps the adapter
   * small enough to audit.
   */
  private zonesAlong(origin: Zone, destination: Zone): readonly Id[] {
    const total = haversineKm(origin, destination);
    const CORRIDOR_WIDTH_KM = 2.5;

    const along = this.options.zones
      .filter((z) => z.id !== origin.id && z.id !== destination.id)
      .map((z) => {
        const viaZone = haversineKm(origin, z) + haversineKm(z, destination);
        return { id: z.id, detour: viaZone - total, progress: haversineKm(origin, z) };
      })
      .filter((z) => z.detour <= CORRIDOR_WIDTH_KM)
      .sort((a, b) => a.progress - b.progress)
      .map((z) => z.id);

    return [origin.id, ...along, destination.id];
  }

  private legsFor(zoneSequence: readonly Id[], totalKm: number): readonly RouteLeg[] {
    const hops = Math.max(1, zoneSequence.length - 1);
    const per = round1(totalKm / hops);
    const legs: RouteLeg[] = [];
    for (let i = 0; i + 1 < zoneSequence.length; i += 1) {
      legs.push({ fromZoneId: zoneSequence[i]!, toZoneId: zoneSequence[i + 1]!, distanceKm: per });
    }
    return legs;
  }
}

/** Straight-line fallback distance, used only in tests and diagnostics. */
export const estimateKm = (a: Zone, b: Zone): number =>
  round1(haversineKm(a, b) * ROAD_DETOUR_FACTOR);
