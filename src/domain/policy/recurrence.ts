import type { CommuteProfile, Ride } from "../entities/ride.js";
import { profileZoneSequence } from "../entities/ride.js";
import type { DayOfWeek, Id, IsoDate, Taka } from "../types.js";

/**
 * Generating rides from a standing commute.
 *
 * This is the product's central bet. In the legacy workbook 9 of 20 postings
 * were re-entries of a route the same person had already described — one poster
 * typed the same Empori to 300 Feet trip five times under four spellings
 * (LEGACY_AUDIT.md D-07). Nearly half the effort ever spent on that tool went
 * into re-describing a known journey.
 *
 * A profile is described once. Everything after that is one tap.
 */

/** How far ahead rides are generated. Two weeks of visible supply. */
export const HORIZON_DAYS = 14;

/**
 * Calendar-day arithmetic, done in UTC on purpose.
 *
 * An earlier version parsed `${date}T00:00:00+06:00` and then read the UTC date
 * back, which silently lost a day: Dhaka midnight is 18:00 UTC the previous
 * day, so adding 24 hours and slicing the UTC date returned the date it started
 * on. Adding days to a bare calendar date is not a timezone operation and must
 * not involve one.
 */
const addDays = (date: IsoDate, days: number): IsoDate => {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
};

/** Day of week for a Dhaka calendar date. */
export const dayOfWeek = (date: IsoDate): DayOfWeek =>
  new Date(`${date}T12:00:00+06:00`).getUTCDay() as DayOfWeek;

/**
 * The dates a profile should have rides on, from tomorrow to the horizon.
 *
 * Starts at tomorrow rather than today: a commute profile is a standing
 * intention, and generating a ride for a departure that may already have passed
 * would publish something nobody can book.
 */
export const occurrenceDates = (
  profile: CommuteProfile,
  today: IsoDate,
  horizonDays: number = HORIZON_DAYS,
): readonly IsoDate[] => {
  if (!profile.isActive) return [];
  const out: IsoDate[] = [];
  for (let i = 1; i <= horizonDays; i += 1) {
    const date = addDays(today, i);
    if (date > profile.validUntil) break;
    if (profile.daysOfWeek.includes(dayOfWeek(date))) out.push(date);
  }
  return out;
};

export interface GenerateOptions {
  readonly profile: CommuteProfile;
  readonly today: IsoDate;
  /** Dates that already have a ride from this profile. Never duplicated. */
  readonly existingDates: readonly IsoDate[];
  readonly costSharePerSeat: Taka;
  readonly fuelPriceId: Id;
  readonly fuelRatePerKm: number;
  readonly distanceKm: number;
  readonly newId: (date: IsoDate) => Id;
  readonly horizonDays?: number;
}

/**
 * Rides for every occurrence not yet generated.
 *
 * Idempotent on date: running this twice produces the same set, because the
 * generator runs daily and must never double-publish. Rides start as `draft`
 * unless the profile opts into `autoPublish`; a draft becomes published when
 * the driver taps "Yes" on the T-14h notification.
 */
export const generateRides = (o: GenerateOptions): readonly Ride[] => {
  const already = new Set(o.existingDates);
  return occurrenceDates(o.profile, o.today, o.horizonDays)
    .filter((date) => !already.has(date))
    .map((date) => ({
      id: o.newId(date),
      profileId: o.profile.id,
      driverId: o.profile.driverId,
      zoneSequence: profileZoneSequence(o.profile),
      departureAt: `${date}T${o.profile.departureWindowStart}:00+06:00`,
      seatsTotal: o.profile.seatsOffered,
      seatsAvailable: o.profile.seatsOffered,
      costSharePerSeat: o.costSharePerSeat,
      fuelPriceId: o.fuelPriceId,
      fuelRatePerKm: o.fuelRatePerKm,
      distanceKm: o.distanceKm,
      pickupPoints: [],
      vehicle: o.profile.vehicle,
      preferences: { womenOnly: false, ac: true, luggage: false, quiet: false },
      status: o.profile.autoPublish ? "published" : "draft",
      rowVersion: 1,
    }));
};
