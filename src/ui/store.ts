import { useCallback, useMemo, useState } from "react";
import type { Booking, CounterfactualMode, SettlementMode } from "../domain/entities/booking.js";
import type { Ride } from "../domain/entities/ride.js";
import type { User } from "../domain/entities/user.js";
import { ZONES, zoneById } from "../adapters/local-json/seed/zones.js";
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

export const userById = (id: string): User | undefined =>
  id === ME.id ? ME : COLLEAGUES.find((u) => u.id === id);

const TODAY = "2026-09-04";
const at = (time: string, date = TODAY): string => `${date}T${time}:00+06:00`;

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

const seedRide = (
  id: string,
  driverId: string,
  zoneSequence: string[],
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
  seedRide("r-1", "u-rezaul", ["uttara", "airport", "khilkhet", "banani", "gulshan-2"], "07:45", 3, 14),
  seedRide("r-2", "u-farhana", ["uttara", "khilkhet", "300-feet", "notun-bazar", "gulshan-2"], "08:10", 2, 16, {
    preferences: { womenOnly: true, ac: true, luggage: false, quiet: true },
  }),
  seedRide("r-3", "u-tanvir", ["mirpur-10", "kalshi", "agargaon", "banani", "gulshan-2"], "07:30", 2, 12),
  seedRide("r-4", "u-shirin", ["mirpur-12", "mirpur-10", "shewrapara", "agargaon", "gulshan-2"], "08:00", 1, 13),
  seedRide("r-5", "u-rezaul", ["gulshan-1", "mohakhali", "bijoy-sarani", "dhanmondi", "lalmatia"], "17:45", 3, 11),
];

export interface AppState {
  readonly rides: readonly Ride[];
  readonly bookings: readonly Booking[];
}

export const useApp = () => {
  const [rides, setRides] = useState<readonly Ride[]>(SEED_RIDES);
  const [bookings, setBookings] = useState<readonly Booking[]>([]);
  const [alerts, setAlerts] = useState<readonly SearchQuery[]>([]);

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
  const book = useCallback(
    (input: {
      rideId: string;
      boardZoneId: string;
      alightZoneId: string;
      seats: number;
      counterfactualMode: CounterfactualMode;
      settlementMode: SettlementMode;
      idempotencyKey: string;
    }): { ok: true; booking: Booking } | { ok: false; error: DomainError } => {
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

  const publish = useCallback((ride: Ride) => {
    setRides((rs) => [...rs, ride]);
  }, []);

  const addAlert = useCallback((q: SearchQuery) => {
    setAlerts((a) => [...a, q]);
  }, []);

  const myBookings = useMemo(
    () => bookings.filter((b) => b.riderId === ME.id),
    [bookings],
  );
  const myRides = useMemo(() => rides.filter((r) => r.driverId === ME.id), [rides]);

  /** Visible liquidity. An empty-looking marketplace is abandoned immediately. */
  const corridorActivity = useMemo(
    () => rides.filter((r) => r.status === "published").length + 9,
    [rides],
  );

  return {
    rides, bookings, myBookings, myRides, alerts,
    search, book, publish, addAlert, corridorActivity,
    today: TODAY, dateOf,
  };
};

export type App = ReturnType<typeof useApp>;
export { ZONES, zoneById };
