import { describe, expect, it } from "vitest";
import type { Ride } from "../../domain/entities/ride.js";
import { savedRoutesOf } from "./OfferFlow.jsx";

/**
 * "Your saved routes" was a hardcoded pair, so a colleague who had never
 * published anything was shown a stranger's commute presented as their own
 * history — one tap from publishing it. These tests pin the parts of the fix
 * that are easy to undo by accident.
 */

const ride = (over: Partial<Ride>): Ride =>
  ({
    id: "r", driverId: "me", zoneSequence: ["uttara", "gulshan-2"],
    departureAt: "2026-09-05T07:45:00+06:00", seatsTotal: 3, seatsAvailable: 3,
    costSharePerSeat: 0, fuelPriceId: "f", fuelRatePerKm: 0, distanceKm: 10,
    pickupPoints: [], vehicle: { type: "car", plate: "" }, status: "published",
    preferences: { womenOnly: false, ac: false, luggage: false, quiet: false },
    rowVersion: 1,
    ...over,
  }) as Ride;

describe("saved routes", () => {
  it("is empty for a driver who has published nothing", () => {
    // The whole point. A first-time driver has no history to offer them.
    expect(savedRoutesOf([])).toEqual([]);
  });

  it("offers the route they actually drove, at the time they drove it", () => {
    expect(savedRoutesOf([ride({})])).toEqual([
      { origin: "uttara", destination: "gulshan-2", time: "07:45" },
    ]);
  });

  it("reads the clock time as written, without shifting the timezone", () => {
    // departureAt carries +06:00. Reading it as UTC would show 01:45.
    const [first] = savedRoutesOf([ride({ departureAt: "2026-09-05T07:45:00+06:00" })]);
    expect(first?.time).toBe("07:45");
  });

  it("takes the ends of the sequence, not just the first two stops", () => {
    const [first] = savedRoutesOf([
      ride({ zoneSequence: ["uttara", "banani", "gulshan-2", "motijheel"] }),
    ]);
    expect(first).toEqual({ origin: "uttara", destination: "motijheel", time: "07:45" });
  });

  it("shows a daily commute once, not thirty times", () => {
    const month = Array.from({ length: 30 }, (_, i) =>
      ride({ id: `r${i}`, departureAt: `2026-09-${String(i + 1).padStart(2, "0")}T07:45:00+06:00` }),
    );
    expect(savedRoutesOf(month)).toHaveLength(1);
  });

  it("puts the route they drive now above one they drove once in March", () => {
    const routes = savedRoutesOf([
      ride({ id: "old", zoneSequence: ["savar", "motijheel"], departureAt: "2026-03-01T09:00:00+06:00" }),
      ride({ id: "new", departureAt: "2026-09-05T07:45:00+06:00" }),
    ]);
    expect(routes[0]?.origin).toBe("uttara");
  });

  it("stays short enough to be a shortcut rather than a list", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      ride({ id: `r${i}`, zoneSequence: [`z${i}`, "motijheel"], departureAt: `2026-09-0${i + 1}T07:45:00+06:00` }),
    );
    expect(savedRoutesOf(many).length).toBeLessThanOrEqual(3);
  });

  it("ignores a ride that starts and ends in the same place", () => {
    expect(savedRoutesOf([ride({ zoneSequence: ["uttara", "uttara"] })])).toEqual([]);
  });
});
