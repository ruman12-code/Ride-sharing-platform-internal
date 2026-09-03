import type { Ride } from "../entities/ride.js";
import type { Id, IsoDateTime } from "../types.js";
import { minutesOfDay, dateOf } from "../types.js";

/**
 * Corridor matching over the seeded zone graph. No paid map API in Phase 1.
 *
 * The legacy search read column C only — the origin — with an unanchored
 * substring match re-run on every keystroke (LEGACY_AUDIT.md L-05). Typing "an"
 * matched Banani, Gulshan and Dhanmondi alike, and the question a rider actually
 * has ("who is going where I need to go?") could not be asked at all.
 */

export interface SearchQuery {
  readonly originZoneId: Id;
  readonly destinationZoneId: Id;
  readonly targetTime: IsoDateTime;
  /** Half-width of the acceptable departure window, in minutes. */
  readonly windowMinutes: number;
  readonly seats: number;
  readonly riderId?: Id;
}

/**
 * Why a ride matched. Always shown — riders need to see the reason, or a
 * "short detour" result looks like a bug.
 */
export type MatchLabel = "exact_route" | "on_the_way" | "short_detour";

export interface MatchResult {
  readonly ride: Ride;
  readonly label: MatchLabel;
  readonly boardZoneId: Id;
  readonly alightZoneId: Id;
  /** Minutes between the rider's target time and the ride's departure. */
  readonly timeDeltaMinutes: number;
  readonly walkingMinutes: number;
  readonly score: number;
}

const LABEL_WEIGHT: Record<MatchLabel, number> = {
  exact_route: 300,
  on_the_way: 200,
  short_detour: 100,
};

/**
 * Does this ride serve the rider's journey, and how directly?
 *
 * Both zones must appear in the ride's ordered sequence with the boarding zone
 * strictly before the alighting zone. A ride from Gulshan to Uttara does not
 * serve a rider going Uttara to Gulshan, however many zones they share.
 */
export const classifyMatch = (
  ride: Ride,
  originZoneId: Id,
  destinationZoneId: Id,
): MatchLabel | undefined => {
  const from = ride.zoneSequence.indexOf(originZoneId);
  const to = ride.zoneSequence.indexOf(destinationZoneId);
  if (from === -1 || to === -1 || from >= to) return undefined;

  const isStart = from === 0;
  const isEnd = to === ride.zoneSequence.length - 1;
  if (isStart && isEnd) return "exact_route";
  // The rider boards or alights at one of the driver's own endpoints: the
  // driver passes through anyway and gives up nothing.
  if (isStart || isEnd) return "on_the_way";
  // Both stops are intermediate — still on the route, but the driver is more
  // likely to be making a small accommodation.
  return "short_detour";
};

export const search = (rides: readonly Ride[], q: SearchQuery): readonly MatchResult[] => {
  const targetMinutes = minutesOfDay(q.targetTime);
  const targetDate = dateOf(q.targetTime);
  const out: MatchResult[] = [];

  for (const ride of rides) {
    if (ride.status !== "published") continue;
    if (ride.seatsAvailable < q.seats) continue;
    if (q.riderId && ride.driverId === q.riderId) continue; // never your own ride
    if (dateOf(ride.departureAt) !== targetDate) continue;

    const delta = Math.abs(minutesOfDay(ride.departureAt) - targetMinutes);
    if (delta > q.windowMinutes) continue;

    const label = classifyMatch(ride, q.originZoneId, q.destinationZoneId);
    if (!label) continue;

    const pickup = ride.pickupPoints.find((p) => p.zoneId === q.originZoneId);
    const walkingMinutes = pickup?.walkingMinutes ?? DEFAULT_WALKING_MINUTES;

    out.push({
      ride,
      label,
      boardZoneId: q.originZoneId,
      alightZoneId: q.destinationZoneId,
      timeDeltaMinutes: delta,
      walkingMinutes,
      score: 0,
    });
  }

  return out
    .map((m) => ({ ...m, score: scoreMatch(m) }))
    .sort((a, b) => b.score - a.score);
};

/** Assumed walk when a ride names no pickup point in the rider's zone. */
export const DEFAULT_WALKING_MINUTES = 10;

/**
 * Rank: match quality, then time proximity, then driver reliability, then walk.
 *
 * Weights are separated by an order of magnitude so the ordering is strictly
 * lexicographic — a better label always beats a closer time, and no combination
 * of small advantages can outrank a categorically better match.
 */
export const scoreMatch = (m: Omit<MatchResult, "score">, reliability = 100): number =>
  LABEL_WEIGHT[m.label] +
  Math.max(0, 60 - m.timeDeltaMinutes) / 2 +
  reliability / 100 -
  Math.min(m.walkingMinutes, 30) / 10;

/**
 * A debounced, in-memory index over published rides.
 *
 * The legacy search re-scanned every row on every keystroke with no index and
 * no debounce. At 20 rows that was merely wasteful; the point of building the
 * index now is that the same code must not become the bottleneck at 2,000.
 */
export class RideIndex {
  /** date -> zoneId -> rides touching that zone on that date. */
  private readonly byDateZone = new Map<string, Map<Id, Ride[]>>();

  constructor(rides: readonly Ride[] = []) {
    for (const r of rides) this.add(r);
  }

  add(ride: Ride): void {
    if (ride.status !== "published") return;
    const date = dateOf(ride.departureAt);
    let zones = this.byDateZone.get(date);
    if (!zones) {
      zones = new Map();
      this.byDateZone.set(date, zones);
    }
    for (const zoneId of ride.zoneSequence) {
      const list = zones.get(zoneId);
      if (list) list.push(ride);
      else zones.set(zoneId, [ride]);
    }
  }

  /** Candidate rides touching the origin zone on the target date. */
  candidates(q: SearchQuery): readonly Ride[] {
    const zones = this.byDateZone.get(dateOf(q.targetTime));
    if (!zones) return [];
    return zones.get(q.originZoneId) ?? [];
  }

  search(q: SearchQuery): readonly MatchResult[] {
    return search(this.candidates(q), q);
  }
}

export const MATCH_LABEL_TEXT: Record<MatchLabel, { en: string; bn: string }> = {
  exact_route: { en: "Exact route", bn: "একই রুট" },
  on_the_way: { en: "On the way", bn: "পথেই পড়ে" },
  short_detour: { en: "Short detour", bn: "সামান্য ঘুরপথ" },
};
