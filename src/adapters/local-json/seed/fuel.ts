import type { FuelPrice } from "../../../domain/pricing/fuel.js";

/**
 * Gazetted fuel prices, as dated records.
 *
 * The February and April 2026 records are kept so a ride published then still
 * prices against the rate that actually applied. Deleting superseded records
 * would make historical cost shares unauditable.
 *
 * Octane at Tk 145 (effective 1 June 2026) is still the rate in force, per the
 * sponsor. The record is therefore stale by the 35-day rule but correct, which
 * is exactly the case `confirmedAt` exists for.
 *
 * **No record here carries `confirmedAt`, deliberately.** A confirmation is an
 * act an administrator performs; seeding one would be recording an approval
 * nobody gave, in the same audit trail we would later rely on. So the app ships
 * with the alarm showing, and the first thing an administrator does is confirm
 * the rate is still right — which is the behaviour the brief asked for: never
 * let a stale rate silently keep computing.
 */
export const FUEL_PRICES: readonly FuelPrice[] = [
  { id: "fp-octane-2026-02", fuelType: "octane", pricePerLitre: 120, effectiveFrom: "2026-02-01", source: "Energy and Mineral Resources Division" },
  { id: "fp-octane-2026-04", fuelType: "octane", pricePerLitre: 140, effectiveFrom: "2026-04-01", source: "Energy and Mineral Resources Division" },
  { id: "fp-octane-2026-06", fuelType: "octane", pricePerLitre: 145, effectiveFrom: "2026-06-01", source: "Energy and Mineral Resources Division" },
  { id: "fp-petrol-2026-06", fuelType: "petrol", pricePerLitre: 140, effectiveFrom: "2026-06-01", source: "Energy and Mineral Resources Division" },
  { id: "fp-diesel-2026-06", fuelType: "diesel", pricePerLitre: 115, effectiveFrom: "2026-06-01", source: "Energy and Mineral Resources Division" },
];
