import type { Route } from "../domain/matching/geo.js";
import type { Id } from "../domain/types.js";

/**
 * Route planning, behind a port.
 *
 * Two adapters implement this:
 *
 *   zone-graph        computes the route locally from zone geography. No
 *                     network, no cost, no third party, no personal data
 *                     leaving the tenant. This is the default.
 *
 *   google-directions calls the Google Directions API for real road geometry
 *                     and live-traffic durations. Better numbers, but it sends
 *                     journey endpoints to a third party and is metered, so it
 *                     is disabled unless the organisation explicitly turns it
 *                     on. See docs/ADR-002-routing.md.
 *
 * The domain never knows which one answered. It reads `provider` and
 * `isEstimate` only to tell the colleague how the number was arrived at.
 */
export interface RoutePlanner {
  /** Undefined when no route exists between the two zones. */
  plan(originZoneId: Id, destinationZoneId: Id): Promise<Route | undefined>;
  readonly name: "zone-graph" | "google-directions";
}
