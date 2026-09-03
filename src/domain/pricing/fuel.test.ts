import { describe, expect, it } from "vitest";
import {
  FUEL_PRICE_STALE_AFTER_DAYS,
  type FuelPrice,
  daysBetween,
  isStale,
  priceAgeInDays,
  priceOnDate,
} from "./fuel.js";

const price = (over: Partial<FuelPrice> = {}): FuelPrice => ({
  id: "fp-1",
  fuelType: "octane",
  pricePerLitre: 145,
  effectiveFrom: "2026-06-01",
  source: "Energy and Mineral Resources Division",
  ...over,
});

describe("daysBetween", () => {
  it("counts whole days in Dhaka time", () => {
    expect(daysBetween("2026-06-01", "2026-06-02")).toBe(1);
    expect(daysBetween("2026-06-01", "2026-09-03")).toBe(94);
    expect(daysBetween("2026-09-03", "2026-06-01")).toBe(-94);
    expect(daysBetween("2026-06-01", "2026-06-01")).toBe(0);
  });

  it("rejects an unparseable date rather than returning NaN", () => {
    expect(() => daysBetween("not-a-date", "2026-06-01")).toThrow(/bad date/);
  });
});

describe("staleness", () => {
  it("flags the 1 June 2026 seed as stale on 3 September 2026", () => {
    // The condition that shipped the app in a permanently-alarmed state.
    // 94 days > 35, so the alarm is correct: the admin must confirm the rate.
    expect(priceAgeInDays(price(), "2026-09-03")).toBe(94);
    expect(isStale(price(), "2026-09-03")).toBe(true);
  });

  it("clears once an admin confirms the rate is still in force", () => {
    // Staleness and incorrectness are different. Octane really was still
    // Tk 145 in September; confirming records that fact without falsifying
    // effectiveFrom or inventing a price change that never happened.
    const confirmed = price({ confirmedAt: "2026-09-03" });
    expect(isStale(confirmed, "2026-09-03")).toBe(false);
    expect(confirmed.pricePerLitre).toBe(145);
    expect(confirmed.effectiveFrom).toBe("2026-06-01");
  });

  it("goes stale again 35 days after the confirmation", () => {
    const confirmed = price({ confirmedAt: "2026-09-03" });
    expect(isStale(confirmed, "2026-10-08")).toBe(false); // day 35
    expect(isStale(confirmed, "2026-10-09")).toBe(true); // day 36
  });

  it("ignores a confirmation that predates the price record", () => {
    const p = price({ effectiveFrom: "2026-06-01", confirmedAt: "2026-05-01" });
    expect(priceAgeInDays(p, "2026-09-03")).toBe(94);
  });

  it("is not stale on the threshold day itself", () => {
    expect(isStale(price(), "2026-07-06")).toBe(false); // day 35
    expect(isStale(price(), "2026-07-07")).toBe(true); // day 36
  });

  it("keeps the threshold as a named constant", () => {
    expect(FUEL_PRICE_STALE_AFTER_DAYS).toBe(35);
  });
});

describe("priceOnDate", () => {
  const history: FuelPrice[] = [
    price({ id: "a", pricePerLitre: 120, effectiveFrom: "2026-02-01" }),
    price({ id: "b", pricePerLitre: 140, effectiveFrom: "2026-04-01" }),
    price({ id: "c", pricePerLitre: 145, effectiveFrom: "2026-06-01" }),
    price({ id: "d", fuelType: "diesel", pricePerLitre: 115, effectiveFrom: "2026-06-01" }),
  ];

  it("returns the rate in force on the ride's own date, not today's", () => {
    // Recomputing history against a current price destroys the audit trail.
    expect(priceOnDate(history, "octane", "2026-03-15")?.pricePerLitre).toBe(120);
    expect(priceOnDate(history, "octane", "2026-05-15")?.pricePerLitre).toBe(140);
    expect(priceOnDate(history, "octane", "2026-09-03")?.pricePerLitre).toBe(145);
  });

  it("takes effect on the effectiveFrom date itself", () => {
    expect(priceOnDate(history, "octane", "2026-06-01")?.pricePerLitre).toBe(145);
    expect(priceOnDate(history, "octane", "2026-05-31")?.pricePerLitre).toBe(140);
  });

  it("keeps fuel types separate", () => {
    expect(priceOnDate(history, "diesel", "2026-09-03")?.pricePerLitre).toBe(115);
  });

  it("returns undefined before any record exists, rather than guessing", () => {
    expect(priceOnDate(history, "octane", "2026-01-01")).toBeUndefined();
    expect(priceOnDate(history, "cng", "2026-09-03")).toBeUndefined();
  });
});
