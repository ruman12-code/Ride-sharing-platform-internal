import { describe, expect, it } from "vitest";
import {
  calculateCostShare,
  explainCostShare,
  floorToNearest10,
  isWithinCap,
  taxiGuidelineFare,
  taxiRatio,
  tripCost,
} from "./cost-share.js";
import { DHAKA_CONGESTION_FACTOR, effectiveKmPerLitre, fuelRatePerKm } from "./fuel.js";

/** Octane at Tk 145/L in a 12 km/L sedan — the worked example from the brief. */
const SEDAN = { fuelPricePerLitre: 145, kmPerLitre: effectiveKmPerLitre(12) };

describe("effectiveKmPerLitre", () => {
  it("applies the 40% congestion penalty from the ARI/BUET finding", () => {
    expect(effectiveKmPerLitre(12)).toBeCloseTo(8.571, 3);
  });

  it("derives Tk 16.9/km for a 12 km/L sedan on Tk 145 octane", () => {
    expect(fuelRatePerKm(145, effectiveKmPerLitre(12))).toBeCloseTo(16.917, 3);
  });

  it("rejects a non-positive rated economy rather than dividing by zero", () => {
    expect(() => effectiveKmPerLitre(0)).toThrow(/positive/);
    expect(() => effectiveKmPerLitre(-1)).toThrow(/positive/);
  });

  it("keeps the congestion factor as a named constant, not a magic number", () => {
    expect(DHAKA_CONGESTION_FACTOR).toBe(1.4);
  });
});

describe("floorToNearest10", () => {
  it("rounds down so shares are payable in real notes", () => {
    expect(floorToNearest10(236)).toBe(230);
    expect(floorToNearest10(78.9)).toBe(70);
    expect(floorToNearest10(70)).toBe(70);
    expect(floorToNearest10(9)).toBe(0);
    expect(floorToNearest10(0)).toBe(0);
  });
});

describe("tripCost", () => {
  it("sums fuel, tolls and parking", () => {
    // 14 km × 16.917 = 236.8 -> 237, + 50 tolls + 30 parking
    expect(tripCost({ distanceKm: 14, ...SEDAN, tolls: 50, parking: 30 })).toBe(317);
  });

  it("treats absent tolls and parking as zero", () => {
    expect(tripCost({ distanceKm: 14, ...SEDAN })).toBe(237);
  });

  it("rejects a non-positive distance", () => {
    expect(() => tripCost({ distanceKm: 0, ...SEDAN })).toThrow(/distanceKm/);
  });

  it("rejects negative tolls or parking, which would understate the trip", () => {
    expect(() => tripCost({ distanceKm: 14, ...SEDAN, tolls: -10 })).toThrow(/negative/);
    expect(() => tripCost({ distanceKm: 14, ...SEDAN, parking: -10 })).toThrow(/negative/);
  });
});

describe("calculateCostShare", () => {
  it("reproduces the worked example from the brief", () => {
    const b = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 2 });
    expect(b.fuelCost).toBe(237);
    expect(b.tripCost).toBe(237);
    expect(b.occupants).toBe(3);
    expect(b.sharePerSeat).toBe(70); // floor10(237/3) = floor10(79) = 70
    expect(b.driverRecovery).toBe(140);
    expect(b.driverContribution).toBe(97);
  });

  it("charges the driver a share even when the car is full", () => {
    const b = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 4 });
    expect(b.occupants).toBe(5);
    expect(b.driverContribution).toBeGreaterThan(0);
  });

  it("recovers nothing when nobody rides", () => {
    const b = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 0 });
    expect(b.sharePerSeat).toBe(230);
    expect(b.driverRecovery).toBe(0);
    expect(b.driverContribution).toBe(b.tripCost);
  });

  it("rejects a fractional or negative rider count", () => {
    expect(() => calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 1.5 })).toThrow(/integer/);
    expect(() => calculateCostShare({ distanceKm: 14, ...SEDAN, riders: -1 })).toThrow(/integer/);
  });
});

/**
 * The regulatory argument for this product, expressed as a test.
 *
 * If this ever fails, the product is selling transport rather than sharing
 * cost. Do not weaken it, do not add an exemption, do not skip it to get a
 * build green.
 */
describe("PROPERTY: a driver can never profit", () => {
  const distances = [0.5, 1, 3, 7.5, 14, 22, 40, 120, 264];
  const prices = [90, 115, 140, 145, 200];
  const economies = [4, 6, 8.57, 12, 25];
  const riderCounts = [0, 1, 2, 3, 4, 5, 6];
  const extras = [0, 25, 100, 500];

  it("holds driverRecovery < tripCost across the whole valid input space", () => {
    let cases = 0;
    for (const distanceKm of distances)
      for (const fuelPricePerLitre of prices)
        for (const kmPerLitre of economies)
          for (const riders of riderCounts)
            for (const tolls of extras) {
              const b = calculateCostShare({
                distanceKm,
                fuelPricePerLitre,
                kmPerLitre,
                riders,
                tolls,
                parking: 0,
              });
              expect(b.driverRecovery).toBeLessThan(b.tripCost);
              expect(b.driverContribution).toBeGreaterThan(0);
              cases += 1;
            }
    expect(cases).toBe(
      distances.length * prices.length * economies.length * riderCounts.length * extras.length,
    );
  });

  it("holds under randomised inputs", () => {
    for (let n = 0; n < 5000; n += 1) {
      const b = calculateCostShare({
        distanceKm: Math.random() * 300 + 0.1,
        fuelPricePerLitre: Math.random() * 400 + 1,
        kmPerLitre: Math.random() * 40 + 0.5,
        riders: Math.floor(Math.random() * 8),
        tolls: Math.floor(Math.random() * 1000),
        parking: Math.floor(Math.random() * 1000),
      });
      expect(b.driverRecovery).toBeLessThan(b.tripCost);
    }
  });

  it("holds at the boundary where rounding is most aggressive", () => {
    // tripCost just under a multiple of 10 × occupants is the worst case for
    // floorToNearest10 giving the driver too much back.
    for (let riders = 1; riders <= 8; riders += 1) {
      for (let cost = 1; cost <= 400; cost += 1) {
        const share = Math.floor(cost / (1 + riders) / 10) * 10;
        expect(share * riders).toBeLessThan(cost);
      }
    }
  });
});

describe("cap enforcement", () => {
  const cap = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 2 }).sharePerSeat;

  it("accepts the computed share", () => {
    expect(isWithinCap(cap, cap)).toBe(true);
  });

  it("accepts a lower amount, including free", () => {
    expect(isWithinCap(50, cap)).toBe(true);
    expect(isWithinCap(0, cap)).toBe(true);
  });

  it("rejects anything above the cap", () => {
    expect(isWithinCap(cap + 1, cap)).toBe(false);
    expect(isWithinCap(9999, cap)).toBe(false);
  });

  it("rejects negative and fractional amounts", () => {
    expect(isWithinCap(-10, cap)).toBe(false);
    expect(isWithinCap(35.5, cap)).toBe(false);
  });
});

describe("taxi guideline comparison", () => {
  it("applies Tk 85 for the first 2 km then Tk 34/km", () => {
    expect(taxiGuidelineFare(2)).toBe(85);
    expect(taxiGuidelineFare(1)).toBe(85);
    expect(taxiGuidelineFare(14)).toBe(85 + 12 * 34); // 493
  });

  it("rejects a non-positive distance", () => {
    expect(() => taxiGuidelineFare(0)).toThrow(/positive/);
  });

  it("keeps the cost-share far below the metered rate", () => {
    const b = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 2 });
    const ratio = taxiRatio(b.sharePerSeat, 14);
    expect(ratio).toBeLessThan(0.25);
    expect(b.sharePerSeat).toBeLessThan(taxiGuidelineFare(14));
  });

  it("stays below the metered rate across every corridor length we expect", () => {
    for (const distanceKm of [3, 7, 11, 14, 18, 25, 40]) {
      for (const riders of [1, 2, 3, 4]) {
        const b = calculateCostShare({ distanceKm, ...SEDAN, riders });
        expect(b.sharePerSeat).toBeLessThan(taxiGuidelineFare(distanceKm));
      }
    }
  });
});

describe("explainCostShare", () => {
  it("shows the working, the recovery and the provenance", () => {
    const b = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 2 });
    const e = explainCostShare(b, {
      type: "octane",
      pricePerLitre: 145,
      effectiveFrom: "2026-06-01",
    });
    expect(e.calculation).toBe("14 km × Tk 16.92/km = Tk 237 fuel ÷ 3 people = Tk 70 each");
    expect(e.recovery).toBe("You recover Tk 140 of your Tk 237.");
    expect(e.provenance).toContain("octane at Tk 145/L (2026-06-01)");
    expect(e.provenance).toContain("8.6 km/L in Dhaka traffic");
  });

  it("names tolls and parking when they apply", () => {
    const b = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 2, tolls: 50, parking: 30 });
    const e = explainCostShare(b, {
      type: "octane",
      pricePerLitre: 145,
      effectiveFrom: "2026-06-01",
    });
    expect(e.calculation).toContain("Tk 50 tolls");
    expect(e.calculation).toContain("Tk 30 parking");
  });

  it("says 'person' not 'people' when the driver rides alone", () => {
    const b = calculateCostShare({ distanceKm: 14, ...SEDAN, riders: 0 });
    const e = explainCostShare(b, { type: "octane", pricePerLitre: 145, effectiveFrom: "x" });
    expect(e.calculation).toContain("÷ 1 person");
  });
});
