import type { Zone } from "../entities/zone.js";
import type { Id } from "../types.js";
import { haversineKm } from "./geo.js";

/**
 * Places on the way: the stops a driver is offered between their start and end.
 *
 * **Why this exists.** Every zone in a ride's sequence is a place a colleague
 * can board (`geo.ts`), so a route with no intermediate stop is a car with no
 * way for anybody to get in except at the very start. The zone graph links any
 * two places within five kilometres directly, which is right for distance and
 * wrong for boarding: Mirpur-10 and Gulshan-2 are 4.9 km apart in a straight
 * line, so the shortest path is one hop and the offer had nowhere for anybody
 * to join. That is the failure this fixes — not a cosmetic one, since carpooling
 * along a corridor is the entire product.
 *
 * **What this is not.** It is geometry. There is no traffic data in this app and
 * none is invented here: nothing below knows that Rokeya Sarani crawls at eight
 * in the morning or that the Kalshi flyover changed everything. A suggestion is
 * a starting point the driver corrects, and the interface says so. Inventing a
 * congestion model would produce numbers that look authoritative and are not,
 * which is worse than offering none.
 *
 * The consequence, stated plainly: a place can be genuinely on the road route
 * and fail the test here, because Dhaka's river, rail and cantonment geography
 * forces detours a straight line knows nothing about. Mirpur-10 to Gulshan-2 via
 * Agargaon is a route people really drive and is a 52% straight-line detour.
 * That is why the driver can add any place, and why the suggestion is offered
 * rather than applied.
 */

/**
 * How far off the straight line a place may sit and still count as "on the way".
 *
 * Measured as (A→V + V→B) ÷ (A→B). 1.0 is exactly on the line.
 *
 * Deliberately generous. A tight threshold produced technically-defensible
 * suggestions that no driver would recognise, because the road network here
 * bends much further than the geometry does. A loose one sometimes proposes a
 * place the driver will remove — which costs one tap, against a route nobody can
 * board.
 */
export const MAX_VIA_DETOUR = 1.35;

/** Most stops to suggest. More than this is a list to manage, not a route. */
export const MAX_VIA = 3;

/**
 * How close to an endpoint a suggestion may sit, as a fraction of the journey.
 *
 * A stop 5% of the way along is the start under another name: nobody plans to
 * board there rather than at the origin, and it clutters the line. At 0.12 the
 * Motijheel to Gulshan-2 route proposed Banani, which is 87% of the way there
 * and effectively the destination.
 */
const EDGE_MARGIN = 0.15;

/**
 * How far to the side of the journey a suggestion may sit.
 *
 * The detour ratio on its own cannot see sideways. A place 20% further by the
 * sum of two legs can be twenty degrees off the bearing, which in a city means
 * a different corridor entirely: Uttara to Gulshan-2 by way of Mirpur-12 costs
 * only 20% in straight-line terms and is on the wrong side of Dhaka.
 *
 * So the sideways offset is bounded too — a quarter of the journey, and never
 * more than three kilometres, whichever binds first. The second half matters on
 * long journeys, where a quarter of thirty kilometres would admit anywhere.
 */
const maxOffsetKm = (directKm: number): number => Math.min(3, directKm * 0.25);

/** Suggestions closer together than this along the journey are the same stop. */
const MIN_SEPARATION = 0.15;

/**
 * How far a place sits to the side of the line between two others.
 *
 * The triangle's height on the A-B side: twice its area over that side's
 * length, with the area from Heron's formula. Clamped at zero because three
 * nearly-collinear points produce a tiny negative under the root through
 * rounding, and a NaN here would silently admit every candidate.
 */
const offsetKm = (toV: number, fromV: number, direct: number): number => {
  const s = (toV + fromV + direct) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - toV) * (s - fromV) * (s - direct)));
  return (2 * area) / direct;
};

export interface ViaCandidate {
  readonly zoneId: Id;
  /** How far along the journey it sits, 0 at the start and 1 at the end. */
  readonly progress: number;
  /** (A→V + V→B) ÷ (A→B). 1.0 is exactly on the straight line. */
  readonly detour: number;
}

/**
 * Every place that lies plausibly between two others, best first.
 *
 * Areas only. Landmarks are the granularity a driver reaches for by hand
 * ("Banani Graveyard", "ECB Chattar") and suggesting them unprompted would fill
 * the line with detail nobody asked for — but a driver can still add one.
 */
export const viaCandidates = (
  originId: Id,
  destinationId: Id,
  zones: readonly Zone[],
): readonly ViaCandidate[] => {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const a = byId.get(originId);
  const b = byId.get(destinationId);
  if (!a || !b || originId === destinationId) return [];

  const direct = haversineKm(a, b);
  // Two places on top of each other have no "between". Dividing by this would
  // make every ratio infinite and every candidate look equally good.
  if (direct < 0.5) return [];

  const out: ViaCandidate[] = [];
  for (const v of zones) {
    if (v.id === originId || v.id === destinationId) continue;
    if (v.parentId) continue; // a landmark: the driver's to add, not ours to propose
    const toV = haversineKm(a, v);
    const fromV = haversineKm(v, b);
    const detour = (toV + fromV) / direct;
    if (detour > MAX_VIA_DETOUR) continue;
    if (offsetKm(toV, fromV, direct) > maxOffsetKm(direct)) continue;
    const progress = toV / (toV + fromV);
    if (progress < EDGE_MARGIN || progress > 1 - EDGE_MARGIN) continue;
    out.push({ zoneId: v.id, progress, detour });
  }
  return out.sort((x, y) => x.detour - y.detour);
};

/**
 * Up to three places to offer, ordered along the journey.
 *
 * Built on top of whatever the route planner already found rather than instead
 * of it: those zones are on the graph's own shortest path, so they have a better
 * claim than anything geometry alone can offer. Geometric candidates fill the
 * remaining slots.
 *
 * Spread matters more than closeness to the line. Three stops bunched at one end
 * describe a route worse than one stop in the middle, and the point of a stop is
 * that somebody can board at it — so a stop where nobody lives adds nothing and
 * a stop nobody can reach from the last one adds less.
 */
export const suggestVia = (
  originId: Id,
  destinationId: Id,
  zones: readonly Zone[],
  fromPlanner: readonly Id[] = [],
): readonly Id[] => {
  const candidates = viaCandidates(originId, destinationId, zones);
  const progressOf = new Map(candidates.map((c) => [c.zoneId, c.progress]));

  const chosen: { zoneId: Id; progress: number }[] = [];
  const consider = (zoneId: Id, progress: number): void => {
    if (chosen.length >= MAX_VIA) return;
    if (chosen.some((c) => c.zoneId === zoneId)) return;
    if (chosen.some((c) => Math.abs(c.progress - progress) < MIN_SEPARATION)) return;
    chosen.push({ zoneId, progress });
  };

  /*
    The planner's own stops first, and kept even when they are a wide detour.
    They came off the road graph; second-guessing them with a straight line is
    how a suggestion stops resembling the route that was computed directly above
    it on the same screen.
  */
  for (const zoneId of fromPlanner) {
    if (zoneId === originId || zoneId === destinationId) continue;
    consider(zoneId, progressOf.get(zoneId) ?? positionOf(zoneId, originId, destinationId, zones));
  }
  for (const c of candidates) consider(c.zoneId, c.progress);

  return chosen.sort((x, y) => x.progress - y.progress).map((c) => c.zoneId);
};

/** Where a place sits along a journey, for one the candidate scan rejected. */
const positionOf = (
  zoneId: Id,
  originId: Id,
  destinationId: Id,
  zones: readonly Zone[],
): number => {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const a = byId.get(originId);
  const b = byId.get(destinationId);
  const v = byId.get(zoneId);
  if (!a || !b || !v) return 0.5;
  const toV = haversineKm(a, v);
  const fromV = haversineKm(v, b);
  return toV + fromV === 0 ? 0.5 : toV / (toV + fromV);
};

/**
 * Road distance along a chosen sequence of places.
 *
 * Used when the driver has edited the stops, because the planner's figure is
 * for the route it computed and not for the one they are now describing.
 *
 * This replaces a heuristic that scaled the planner's distance by the fraction
 * of suggested stops kept. That was defensible while stops could only be
 * removed and wrong the moment they could be added: adding a fourth stop to
 * three scaled the journey up by a third, so a driver who said "I also go past
 * Banani" was quoted a longer trip and a larger cost share for the same drive.
 *
 * Still an estimate, by the same detour factor as everything else here, and
 * still labelled as one.
 */
export const pathDistanceKm = (
  sequence: readonly Id[],
  zones: readonly Zone[],
  detourFactor: number,
): number => {
  const byId = new Map(zones.map((z) => [z.id, z]));
  /*
    Unknown places are dropped before measuring, not skipped while measuring.

    Skipping a leg whose endpoint is unknown dropped *both* legs touching it, so
    one unrecognised id in the middle of a journey returned zero kilometres —
    and zero kilometres is a free ride with no cost share, arrived at silently.
    Removing the place instead measures the journey that remains, which is the
    honest reading of "somewhere we do not know about".
  */
  const known = sequence.map((id) => byId.get(id)).filter((z): z is Zone => z !== undefined);
  let km = 0;
  for (let i = 1; i < known.length; i++) km += haversineKm(known[i - 1]!, known[i]!);
  return km * detourFactor;
};

/** Where each place sits along a journey, for ordering a hand-edited list. */
export const orderAlongRoute = (
  originId: Id,
  destinationId: Id,
  viaIds: readonly Id[],
  zones: readonly Zone[],
): readonly Id[] =>
  [...new Set(viaIds)]
    .filter((id) => id !== originId && id !== destinationId)
    .map((id) => ({ id, at: positionOf(id, originId, destinationId, zones) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.id);
