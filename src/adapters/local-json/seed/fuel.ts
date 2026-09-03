import type { FuelPrice } from "../../../domain/pricing/fuel.js";

/**
 * Gazetted fuel prices, as dated records.
 *
 * The February and April 2026 records are kept so a ride published then still
 * prices against the rate that actually applied. Deleting superseded records
 * would make historical cost shares unauditable.
 *
 * Octane at Tk 145 (effective 1 June 2026) is still the rate in force as of
 * 3 September 2026, confirmed by the sponsor. The record is therefore stale by
 * the 35-day rule but correct, which is exactly the case `confirmedAt` exists
 * for: an admin re-affirms it rather than inventing a price change.
 */
export const FUEL_PRICES: readonly FuelPrice[] = [
  { id: "fp-octane-2026-02", fuelType: "octane", pricePerLitre: 120, effectiveFrom: "2026-02-01", source: "Energy and Mineral Resources Division" },
  { id: "fp-octane-2026-04", fuelType: "octane", pricePerLitre: 140, effectiveFrom: "2026-04-01", source: "Energy and Mineral Resources Division" },
  { id: "fp-octane-2026-06", fuelType: "octane", pricePerLitre: 145, effectiveFrom: "2026-06-01", source: "Energy and Mineral Resources Division", confirmedAt: "2026-09-03" },
  { id: "fp-petrol-2026-06", fuelType: "petrol", pricePerLitre: 140, effectiveFrom: "2026-06-01", source: "Energy and Mineral Resources Division", confirmedAt: "2026-09-03" },
  { id: "fp-diesel-2026-06", fuelType: "diesel", pricePerLitre: 115, effectiveFrom: "2026-06-01", source: "Energy and Mineral Resources Division", confirmedAt: "2026-09-03" },
];
