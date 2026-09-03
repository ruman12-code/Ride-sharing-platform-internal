import type { Taka } from "../types.js";
import { fuelRatePerKm } from "./fuel.js";

/**
 * Cost-share calculation.
 *
 * The organisation is sharing the cost of a journey somebody was making anyway.
 * It is not selling transport, and the arithmetic here is what makes that claim
 * true rather than merely asserted — see `driverRecovery` below.
 *
 * UI copy rule, enforced by review: "sharing costs, not driving for hire".
 * Never "fare", "price", "charge" or "payment".
 */

export interface TripCostInputs {
  readonly distanceKm: number;
  /** Litres-per-km cost basis, from the dated FuelPrice in force on the ride's date. */
  readonly fuelPricePerLitre: Taka;
  /**
   * Kilometres per litre actually achieved. Either the congestion-adjusted
   * default (`effectiveKmPerLitre(rated)`) or, better, the driver's own
   * tank-to-tank measurement. A measured number beats any default.
   */
  readonly kmPerLitre: number;
  readonly tolls?: Taka;
  readonly parking?: Taka;
}

export interface CostShareInputs extends TripCostInputs {
  /** Riders, excluding the driver. */
  readonly riders: number;
}

export interface CostShareBreakdown {
  readonly distanceKm: number;
  readonly fuelRatePerKm: number;
  readonly fuelCost: Taka;
  readonly tolls: Taka;
  readonly parking: Taka;
  readonly tripCost: Taka;
  /** Driver + riders. Always at least 1. */
  readonly occupants: number;
  readonly riders: number;
  /** The cap. A driver may charge this or less, never more. */
  readonly sharePerSeat: Taka;
  /** What the driver gets back. Always strictly less than `tripCost`. */
  readonly driverRecovery: Taka;
  /** What the driver still pays out of pocket. Always positive. */
  readonly driverContribution: Taka;
}

/** Round down to the nearest Tk 10, so shares are payable in real notes. */
export const floorToNearest10 = (amount: number): Taka => Math.floor(amount / 10) * 10;

export const tripCost = (i: TripCostInputs): Taka => {
  if (!(i.distanceKm > 0)) throw new Error(`distanceKm must be positive, got ${i.distanceKm}`);
  const rate = fuelRatePerKm(i.fuelPricePerLitre, i.kmPerLitre);
  const tolls = i.tolls ?? 0;
  const parking = i.parking ?? 0;
  if (tolls < 0 || parking < 0) throw new Error("tolls and parking cannot be negative");
  return Math.round(i.distanceKm * rate + tolls + parking);
};

/**
 * The full working, for display as well as for enforcement.
 *
 * Dividing by occupants **including the driver** is the core control. Because
 * the driver always counts as one occupant:
 *
 *     driverRecovery = riders × floor10(tripCost / (1 + riders))
 *                    ≤ riders × tripCost / (1 + riders)
 *                    < tripCost                          for all riders ≥ 0
 *
 * so the driver can never recover the full cost of the trip, let alone exceed
 * it. Profit is arithmetically impossible rather than merely prohibited. This
 * is the same control mitfahrgelegenheit.de and BlaBlaCar used to remain a
 * cost-sharing service rather than commercial passenger transport.
 *
 * `PROPERTY: driverRecovery < tripCost` is asserted by a property-based test
 * over the whole valid input space. If that test ever fails, the regulatory
 * argument for this product has failed with it — do not weaken the test.
 */
export const calculateCostShare = (i: CostShareInputs): CostShareBreakdown => {
  if (!Number.isInteger(i.riders) || i.riders < 0) {
    throw new Error(`riders must be a non-negative integer, got ${i.riders}`);
  }
  const rate = fuelRatePerKm(i.fuelPricePerLitre, i.kmPerLitre);
  const tolls = i.tolls ?? 0;
  const parking = i.parking ?? 0;
  const fuelCost = Math.round(i.distanceKm * rate);
  const cost = tripCost(i);
  const occupants = 1 + i.riders;
  const sharePerSeat = floorToNearest10(cost / occupants);
  const driverRecovery = sharePerSeat * i.riders;

  return {
    distanceKm: i.distanceKm,
    fuelRatePerKm: rate,
    fuelCost,
    tolls,
    parking,
    tripCost: cost,
    occupants,
    riders: i.riders,
    sharePerSeat,
    driverRecovery,
    driverContribution: cost - driverRecovery,
  };
};

/**
 * Taxicab Service Guideline 2010: Tk 85 for the first 2 km, Tk 34/km after.
 *
 * Not a cap the domain enforces — it is the yardstick. The ratio of our
 * cost-share to this figure is exposed in the admin export as the evidence pack
 * for any future regulatory conversation: a share that is a small fraction of
 * the metered rate is visibly not a commercial fare.
 */
export const TAXI_BASE_FARE: Taka = 85;
export const TAXI_BASE_KM = 2;
export const TAXI_PER_KM: Taka = 34;

export const taxiGuidelineFare = (distanceKm: number): Taka => {
  if (!(distanceKm > 0)) throw new Error(`distanceKm must be positive, got ${distanceKm}`);
  return TAXI_BASE_FARE + Math.max(0, distanceKm - TAXI_BASE_KM) * TAXI_PER_KM;
};

/** Cost-share as a fraction of the metered guideline rate. Lower is safer. */
export const taxiRatio = (sharePerSeat: Taka, distanceKm: number): number =>
  sharePerSeat / taxiGuidelineFare(distanceKm);

/**
 * The cap, enforced in the domain and overridable by nobody — not the driver,
 * not an admin, not a config flag.
 *
 * A driver may set a lower amount, including Tk 0. Any attempt to set more than
 * the computed share is rejected here, before it can reach a store.
 */
export const isWithinCap = (proposed: Taka, cap: Taka): boolean =>
  Number.isInteger(proposed) && proposed >= 0 && proposed <= cap;

/** Human-readable working, shown on every ride detail and in the offer flow. */
export interface CostShareExplanation {
  readonly calculation: string;
  readonly recovery: string;
  readonly provenance: string;
}

export const explainCostShare = (
  b: CostShareBreakdown,
  fuel: { readonly type: string; readonly pricePerLitre: Taka; readonly effectiveFrom: string },
): CostShareExplanation => ({
  calculation:
    `${b.distanceKm} km × Tk ${b.fuelRatePerKm.toFixed(2)}/km = Tk ${b.fuelCost} fuel` +
    (b.tolls ? ` + Tk ${b.tolls} tolls` : "") +
    (b.parking ? ` + Tk ${b.parking} parking` : "") +
    ` ÷ ${b.occupants} ${b.occupants === 1 ? "person" : "people"} = Tk ${b.sharePerSeat} each`,
  recovery: `You recover Tk ${b.driverRecovery} of your Tk ${b.tripCost}.`,
  provenance:
    `Based on ${fuel.type} at Tk ${fuel.pricePerLitre}/L (${fuel.effectiveFrom}) ` +
    `and ${(b.fuelRatePerKm > 0 ? fuel.pricePerLitre / b.fuelRatePerKm : 0).toFixed(1)} km/L in Dhaka traffic.`,
});
