import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import type { Booking, CounterfactualMode, SettlementMode } from "../domain/entities/booking.js";
import type { Ride } from "../domain/entities/ride.js";
import type { User } from "../domain/entities/user.js";
import type { CreditEntry } from "../domain/entities/ledger.js";
import type { Feedback, Incident, IncidentCategory } from "../domain/entities/support.js";
import { ZONES, zoneById } from "../adapters/local-json/seed/zones.js";
import { ZoneGraphPlanner } from "../adapters/routing/zone-graph.js";
import { RouteTablePlanner, type RouteTable } from "../adapters/routing/route-table.js";
import routeTable from "../adapters/routing/route-table.json";
import { ZoneGraph, type Route } from "../domain/matching/geo.js";
import { FUEL_PRICES } from "../adapters/local-json/seed/fuel.js";
import { priceOnDate, effectiveKmPerLitre } from "../domain/pricing/fuel.js";
import { calculateCostShare, explainCostShare } from "../domain/pricing/cost-share.js";
import { RideIndex, type MatchResult, type SearchQuery } from "../domain/matching/corridor.js";
import { computeSeatsAvailable, validateBooking } from "../domain/policy/invariants.js";
import type { DomainError } from "../domain/types.js";
import { dateOf } from "../domain/types.js";

/**
 * Application state for the demo build.
 *
 * Held in memory and wired to the same pure domain functions the production
 * adapters will call. Deliberately NOT localStorage: nothing authoritative
 * belongs in the browser, and seat availability least of all.
 */

export const ME: User = {
  id: "u-me",
  displayName: "Nusrat Jahan",
  email: "nusrat.jahan@example.org",
  department: "Programmes",
  officeLocation: "Gulshan-2",
  phone: "01712345678",
  role: "member",
  reliabilityScore: 96,
  creditBalance: 0,
  isSuspended: false,
};

export const COLLEAGUES: readonly User[] = [
  { ...ME, id: "u-rezaul", displayName: "Rezaul Karim", department: "Finance", reliabilityScore: 98 },
  { ...ME, id: "u-farhana", displayName: "Farhana Haque", department: "Operations", reliabilityScore: 91 },
  { ...ME, id: "u-tanvir", displayName: "Tanvir Ahmed", department: "IT", reliabilityScore: 87 },
  { ...ME, id: "u-shirin", displayName: "Shirin Akter", department: "Programmes", reliabilityScore: 100 },
];

/**
 * Live colleagues, published by the store once the server answers.
 *
 * A module-level cache rather than context so the small presentational
 * components that only need a name do not each have to be threaded through.
 */
let livePeople: readonly { id: string; displayName: string; department: string; reliabilityScore: number }[] = [];
export const setLivePeople = (p: readonly { id: string; displayName: string; department: string; reliabilityScore: number }[]): void => {
  livePeople = p;
};

export const userById = (id: string): User | undefined => {
  const live = livePeople.find((u) => u.id === id);
  if (live) {
    return { ...ME, id: live.id, displayName: live.displayName, department: live.department, reliabilityScore: live.reliabilityScore };
  }
  return id === ME.id ? ME : COLLEAGUES.find((u) => u.id === id);
};

/**
 * Today, in Dhaka.
 *
 * Read from the clock rather than pinned to a constant. A hardcoded date meant
 * that on any other day the offer flow proposed a departure already in the
 * past, which the server correctly refused — so publishing simply stopped
 * working, silently, the day after the constant was written.
 */
const dhakaToday = (): string =>
  new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);

const TODAY = dhakaToday();

/**
 * The date a new ride defaults to.
 *
 * Tomorrow, because a commute posted for a time that has already passed today
 * is unbookable, and because the overwhelmingly common case is arranging
 * tomorrow morning.
 */
export const defaultRideDate = (): string =>
  new Date(Date.now() + 6 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
/**
 * Demo rides are seeded for tomorrow, matching the offer and find defaults.
 *
 * Seeding them for today left the standalone demo showing nothing on its own
 * default search — a first impression of an empty app, which is exactly the
 * impression this product cannot afford to give.
 */
const at = (time: string, date = defaultRideDate()): string => `${date}T${time}:00+06:00`;

const octane = priceOnDate(FUEL_PRICES, "octane", TODAY)!;

/** Cost share for a distance and rider count, using the rate in force today. */
export const shareFor = (distanceKm: number, riders: number) =>
  calculateCostShare({
    distanceKm,
    fuelPricePerLitre: octane.pricePerLitre,
    kmPerLitre: effectiveKmPerLitre(12),
    riders,
  });

export const explain = (distanceKm: number, riders: number) =>
  explainCostShare(shareFor(distanceKm, riders), {
    type: "octane",
    pricePerLitre: octane.pricePerLitre,
    effectiveFrom: octane.effectiveFrom,
  });

export const ACTIVE_FUEL_PRICE = octane;

const graph = new ZoneGraph(ZONES);

/**
 * A demo ride, routed the same way a real one is.
 *
 * The zone sequence and distance come from the router rather than being written
 * by hand, so the seeded data exercises the same code path a colleague does and
 * cannot drift away from it.
 */
const seedRide = (
  id: string,
  driverId: string,
  from: string,
  to: string,
  time: string,
  seatsTotal: number,
  over: Partial<Ride> = {},
): Ride => {
  const route = graph.route(from, to);
  if (!route) throw new Error(`no route for demo ride ${id}: ${from} -> ${to}`);
  return seedRideFrom(id, driverId, route.zoneSequence, time, seatsTotal, route.distanceKm, over);
};

const seedRideFrom = (
  id: string,
  driverId: string,
  zoneSequence: readonly string[],
  time: string,
  seatsTotal: number,
  distanceKm: number,
  over: Partial<Ride> = {},
): Ride => ({
  id,
  driverId,
  zoneSequence,
  departureAt: at(time),
  seatsTotal,
  seatsAvailable: seatsTotal,
  costSharePerSeat: shareFor(distanceKm, seatsTotal).sharePerSeat,
  fuelPriceId: octane.id,
  fuelRatePerKm: octane.pricePerLitre / effectiveKmPerLitre(12),
  distanceKm,
  pickupPoints: zoneSequence.map((zid) => ({
    zoneId: zid,
    label: `${zoneById(zid)?.nameEn ?? zid} main road`,
    walkingMinutes: 3 + (zid.length % 5),
  })),
  vehicle: { type: "car", model: "Toyota Axio", colour: "Silver", plateLast4: "4417", ratedKmPerLitre: 12, fuelType: "octane" },
  preferences: { womenOnly: false, ac: true, luggage: false, quiet: false },
  status: "published",
  rowVersion: 1,
  ...over,
});

const SEED_RIDES: Ride[] = [
  seedRide("r-1", "u-rezaul", "uttara", "gulshan-2", "07:45", 3),
  seedRide("r-2", "u-farhana", "uttara-11", "gulshan-2", "08:10", 2, {
    preferences: { womenOnly: true, ac: true, luggage: false, quiet: true },
  }),
  seedRide("r-3", "u-tanvir", "mirpur-10", "gulshan-2", "07:30", 2),
  seedRide("r-4", "u-shirin", "mirpur-12", "gulshan-2", "08:00", 1),
  seedRide("r-5", "u-rezaul", "gulshan-1", "mohammadpur", "17:45", 3),
];

export interface AppState {
  readonly rides: readonly Ride[];
  readonly bookings: readonly Booking[];
}

/**
 * The active route planner.
 *
 * Serves the precomputed table that ships with the app, falling back to the
 * local graph for any pair the table lacks. **The app makes no network calls to
 * route anything**, so no record of who travels where can accumulate anywhere.
 *
 * The table itself is regenerated offline by an administrator
 * (`npm run build:routes`), optionally against Google for real road distances.
 * See docs/ADR-002-routing.md.
 */
export const planner = new RouteTablePlanner(
  routeTable as RouteTable,
  new ZoneGraphPlanner(ZONES),
);

export const useApp = () => {
  const [rides, setRides] = useState<readonly Ride[]>(SEED_RIDES);
  const [bookings, setBookings] = useState<readonly Booking[]>([]);
  /**
   * Whether a pilot server is answering.
   *
   * When it is, rides and bookings are the organisation's real ones and every
   * colleague sees the same list — which is the entire point of a pilot. When
   * it is not, this is the standalone demo build and the seeded rides stand in.
   */
  const [live, setLive] = useState(false);
  const [me, setMe] = useState<{ userId: string; displayName: string } | undefined>();
  /**
   * Real colleagues, from the server.
   *
   * Names only. Without this a ride published by Ruman rendered under a demo
   * persona's name, because the lookup fell through to the seeded list — which
   * is worse than showing nothing: it attributes a colleague's journey to
   * somebody else.
   */
  const [people, setPeople] = useState<readonly { id: string; displayName: string; department: string; reliabilityScore: number }[]>([]);

  const refresh = useCallback(async () => {
    const [r, b, p] = await Promise.all([api.rides(), api.myBookings(), api.people()]);
    if (p.ok && p.value) {
      setPeople(p.value.people);
      setLivePeople(p.value.people);
    }
    if (r.ok && r.value) {
      setRides(r.value.rides);
      setLive(true);
    }
    if (b.ok && b.value) setBookings(b.value.bookings);
  }, []);

  /**
   * Identify the signed-in colleague and load their view.
   *
   * Exposed as well as run on mount, because the store is created before the
   * access gate is passed: the mount-time call sees a 401, and without a way to
   * re-run it the app stayed on seeded demo rides and wrote nowhere, while
   * looking entirely normal. The gate calls this the moment sign-in succeeds.
   */
  const reload = useCallback(async () => {
    const r = await api.me();
    if (r.ok && r.value) {
      setMe({ userId: r.value.userId, displayName: r.value.displayName });
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Who "I" am: the signed-in colleague, or the demo persona offline. */
  const identity = me ?? { userId: ME.id, displayName: ME.displayName };
  const [alerts, setAlerts] = useState<readonly SearchQuery[]>([]);
  const [ledger, setLedger] = useState<readonly CreditEntry[]>([]);
  const [feedback, setFeedback] = useState<readonly Feedback[]>([]);
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);

  const index = useMemo(() => new RideIndex(rides), [rides]);

  const search = useCallback(
    (q: SearchQuery): readonly MatchResult[] => index.search({ ...q, riderId: ME.id }),
    [index],
  );

  /**
   * Book a seat, through the same domain validation the service uses.
   *
   * Returns a DomainError rather than throwing, because "that seat just went"
   * is a normal outcome the UI must render.
   */
  const bookRemote = useCallback(
    async (input: {
      rideId: string;
      boardZoneId: string;
      alightZoneId: string;
      seats: number;
      counterfactualMode: CounterfactualMode;
      settlementMode: SettlementMode;
      idempotencyKey: string;
    }): Promise<{ ok: true; booking: Booking } | { ok: false; error: DomainError }> => {
      const res = await api.book(input);
      if (res.ok && res.value) {
        await refresh();
        return { ok: true, booking: res.value };
      }
      // The server has already applied the same domain rules, so its refusal is
      // the authoritative one and is shown as written.
      return {
        ok: false,
        error: { code: "SEAT_TAKEN", message: res.error ?? "That seat just went." },
      };
    },
    [refresh],
  );

  const publishRemote = useCallback(
    async (ride: Ride): Promise<boolean> => {
      const res = await api.publish(ride);
      if (res.ok) await refresh();
      return res.ok;
    },
    [refresh],
  );

  const book = useCallback(
    async (input: {
      rideId: string;
      boardZoneId: string;
      alightZoneId: string;
      seats: number;
      counterfactualMode: CounterfactualMode;
      settlementMode: SettlementMode;
      idempotencyKey: string;
    }): Promise<{ ok: true; booking: Booking } | { ok: false; error: DomainError }> => {
      // Async even offline, so callers see one contract whether or not a pilot
      // server is answering.
      const ride = rides.find((r) => r.id === input.rideId);
      if (!ride) {
        return { ok: false, error: { code: "NOT_FOUND", message: "That ride no longer exists." } };
      }

      const existing = bookings.find(
        (b) => b.riderId === ME.id && b.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return { ok: true, booking: existing };

      const onRide = bookings.filter((b) => b.rideId === ride.id);
      const others = bookings
        .filter((b) => b.riderId === ME.id && b.rideId !== ride.id)
        .map((b) => ({
          departureAt: rides.find((r) => r.id === b.rideId)?.departureAt ?? "",
          status: b.status,
        }))
        .filter((o) => o.departureAt !== "");

      const check = validateBooking(
        {
          rideId: ride.id,
          riderId: ME.id,
          boardZoneId: input.boardZoneId,
          alightZoneId: input.alightZoneId,
          seats: input.seats,
          idempotencyKey: input.idempotencyKey,
          expectedRowVersion: ride.rowVersion,
        },
        {
          ride,
          existingBookings: onRide,
          ridersOtherBookings: others,
          riderIsSuspended: ME.isSuspended,
          now: at("06:00"),
        },
      );
      if (!check.ok) return { ok: false, error: check.error };

      const booking: Booking = {
        id: `bk-${bookings.length + 1}`,
        rideId: ride.id,
        riderId: ME.id,
        boardZoneId: input.boardZoneId,
        alightZoneId: input.alightZoneId,
        seats: input.seats,
        status: "requested",
        amount: ride.costSharePerSeat * input.seats,
        settlementMode: input.settlementMode,
        counterfactualMode: input.counterfactualMode,
        idempotencyKey: input.idempotencyKey,
        rowVersion: 1,
      };

      const nextBookings = [...bookings, booking];
      setBookings(nextBookings);
      setRides((rs) =>
        rs.map((r) =>
          r.id !== ride.id
            ? r
            : {
                ...r,
                // Always recomputed from bookings, never decremented blindly.
                seatsAvailable: computeSeatsAvailable(
                  r.seatsTotal,
                  nextBookings.filter((b) => b.rideId === r.id),
                ),
                rowVersion: r.rowVersion + 1,
              },
        ),
      );
      return { ok: true, booking };
    },
    [rides, bookings],
  );

  const publish = useCallback(
    async (ride: Ride): Promise<boolean> => {
      if (live) return publishRemote(ride);
      setRides((rs) => [...rs, ride]);
      return true;
    },
    [live, publishRemote],
  );

  /**
   * Complete a trip: mark the booking, then write the ledger entry.
   *
   * The ledger records who owes whom. No money moves through this platform and
   * credits are not redeemable for cash — that is what keeps the product
   * outside Bangladesh Bank's payment regime. Do not add a cash-out path.
   */
  const completeTrip = useCallback((bookingId: string) => {
    setBookings((bs) =>
      bs.map((b) => (b.id === bookingId ? { ...b, status: "completed" as const } : b)),
    );
    setBookings((current) => {
      const booking = current.find((b) => b.id === bookingId);
      if (!booking) return current;
      const ride = rides.find((r) => r.id === booking.rideId);
      if (!ride) return current;
      setLedger((l) =>
        l.some((e) => e.bookingId === bookingId)
          ? l // idempotent: completing twice must not double the entry
          : [
              ...l,
              {
                id: `ce-${l.length + 1}`,
                bookingId,
                fromUserId: booking.riderId,
                toUserId: ride.driverId,
                amount: booking.amount,
                createdAt: at("09:00"),
              },
            ],
      );
      return current;
    });
  }, [rides]);

  /** Ratings are aggregate-only. A rating is never shown attributed to its rater. */
  const rate = useCallback(
    (bookingId: string, rateeId: string, rating: 1 | 2 | 3 | 4 | 5, tags: string[] = []) => {
      setFeedback((f) =>
        f.some((x) => x.bookingId === bookingId && x.raterId === ME.id)
          ? f
          : [...f, { bookingId, raterId: ME.id, rateeId, rating, tags }],
      );
    },
    [],
  );

  const reportIncident = useCallback(
    (bookingId: string, category: IncidentCategory, description: string) => {
      setIncidents((i) => [
        ...i,
        {
          id: `inc-${i.length + 1}`,
          bookingId,
          reporterId: ME.id,
          category,
          severity: category === "safety" || category === "harassment" ? "high" : "low",
          description,
          status: "open",
        },
      ]);
    },
    [],
  );

  /** Average rating for a colleague. Never the individual scores. */
  const ratingFor = useCallback(
    (userId: string): { average: number; count: number } | undefined => {
      const mine = feedback.filter((f) => f.rateeId === userId);
      if (mine.length === 0) return undefined;
      return {
        average: Math.round((mine.reduce((s, f) => s + f.rating, 0) / mine.length) * 10) / 10,
        count: mine.length,
      };
    },
    [feedback],
  );

  const addAlert = useCallback((q: SearchQuery) => {
    setAlerts((a) => [...a, q]);
  }, []);

  const myBookings = useMemo(
    () => bookings.filter((b) => b.riderId === identity.userId),
    [bookings, identity.userId],
  );
  const myRides = useMemo(
    () => rides.filter((r) => r.driverId === identity.userId),
    [rides, identity.userId],
  );

  /** Visible liquidity. An empty-looking marketplace is abandoned immediately. */
  const corridorActivity = useMemo(
    () => rides.filter((r) => r.status === "published").length + 9,
    [rides],
  );

  const planRoute = useCallback(
    (originZoneId: string, destinationZoneId: string): Promise<Route | undefined> =>
      planner.plan(originZoneId, destinationZoneId),
    [],
  );

  return {
    rides, bookings, myBookings, myRides, alerts, ledger, feedback, incidents,
    search, publish, addAlert, corridorActivity, planRoute,
    completeTrip, rate, reportIncident, ratingFor,
    // Against a live server the booking goes to the server, where the seat
    // race and every other invariant is settled authoritatively.
    book: live ? bookRemote : book,
    live, identity, refresh, reload, people,
    today: TODAY, dateOf,
  };
};

export type App = ReturnType<typeof useApp>;
export { ZONES, zoneById };
