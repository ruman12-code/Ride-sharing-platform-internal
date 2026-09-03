import type { Id, IsoDate, Taka } from "../types.js";

/**
 * A dated, versioned fuel price. Never a constant.
 *
 * Bangladesh runs an automatic fuel pricing mechanism that adjusts against
 * global markets periodically — octane moved Tk 120 → 140 → 145 between
 * February and June 2026. A hardcoded rate would silently mis-price every ride
 * after the first adjustment and would destroy the audit trail that the
 * cost-share cap argument depends on.
 */
export interface FuelPrice {
  readonly id: Id;
  readonly fuelType: FuelType;
  readonly pricePerLitre: Taka;
  readonly effectiveFrom: IsoDate;
  readonly source: string;
  /**
   * When an admin last confirmed this record still reflects the gazetted rate.
   *
   * Staleness and incorrectness are different things. A rate can be months old
   * and still be exactly right, which is the situation at launch: the 1 June
   * 2026 octane rate of Tk 145 was still in effect in September. Re-affirming
   * writes this field rather than inventing a new price, so the alarm clears
   * without falsifying `effectiveFrom`.
   */
  readonly confirmedAt?: IsoDate;
}

export type FuelType = "octane" | "petrol" | "diesel" | "cng";

/** Days after which the active price must be re-confirmed by an admin. */
export const FUEL_PRICE_STALE_AFTER_DAYS = 35;

/**
 * Congestion multiplier applied to a vehicle's rated fuel economy.
 *
 * ARI/BUET find Dhaka congestion burns ~40% additional fuel. A 12 km/L sedan
 * therefore returns 12 / 1.40 = 8.57 km/L in practice. This is a *default*: a
 * driver's own tank-to-tank measurement always beats it.
 */
export const DHAKA_CONGESTION_FACTOR = 1.4;

export const effectiveKmPerLitre = (ratedKmPerLitre: number): number => {
  if (!(ratedKmPerLitre > 0)) {
    throw new Error(`ratedKmPerLitre must be positive, got ${ratedKmPerLitre}`);
  }
  return ratedKmPerLitre / DHAKA_CONGESTION_FACTOR;
};

/** Taka per kilometre = price per litre ÷ kilometres per litre. */
export const fuelRatePerKm = (pricePerLitre: Taka, kmPerLitre: number): number => {
  if (!(kmPerLitre > 0)) throw new Error(`kmPerLitre must be positive, got ${kmPerLitre}`);
  if (!(pricePerLitre > 0)) {
    throw new Error(`pricePerLitre must be positive, got ${pricePerLitre}`);
  }
  return pricePerLitre / kmPerLitre;
};

/** Whole days between two `YYYY-MM-DD` dates. */
export const daysBetween = (from: IsoDate, to: IsoDate): number => {
  const a = Date.parse(`${from}T00:00:00+06:00`);
  const b = Date.parse(`${to}T00:00:00+06:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`bad date: ${from} / ${to}`);
  return Math.round((b - a) / 86_400_000);
};

/**
 * Age of a price record, measured from the later of `effectiveFrom` and the
 * last admin confirmation.
 */
export const priceAgeInDays = (price: FuelPrice, today: IsoDate): number => {
  const anchor =
    price.confirmedAt && price.confirmedAt > price.effectiveFrom
      ? price.confirmedAt
      : price.effectiveFrom;
  return daysBetween(anchor, today);
};

export const isStale = (price: FuelPrice, today: IsoDate): boolean =>
  priceAgeInDays(price, today) > FUEL_PRICE_STALE_AFTER_DAYS;

/**
 * The price in force for a fuel type on a given date.
 *
 * Returns the most recent record whose `effectiveFrom` is on or before the
 * date — never today's price applied to a past ride. Recomputing history
 * against a current rate destroys the audit trail (LEGACY_AUDIT.md D-09).
 */
export const priceOnDate = (
  prices: readonly FuelPrice[],
  fuelType: FuelType,
  date: IsoDate,
): FuelPrice | undefined =>
  prices
    .filter((p) => p.fuelType === fuelType && p.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
