import { describe, expect, it } from "vitest";
import { buildWorkbook, exportFilename, type ExportInput } from "./excel.js";
import { ride, user } from "../test/factories.js";
import { ZONES } from "../adapters/local-json/seed/zones.js";
import { FUEL_PRICES } from "../adapters/local-json/seed/fuel.js";
import type { Booking } from "../domain/entities/booking.js";
import type { CreditEntry } from "../domain/entities/ledger.js";

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "bk-1", rideId: "ride-1", riderId: "u-rider",
  boardZoneId: "khilkhet", alightZoneId: "gulshan-2", seats: 1,
  status: "completed", amount: 70, settlementMode: "credit_ledger",
  counterfactualMode: "bus", idempotencyKey: "k1", rowVersion: 1,
  ...over,
});

const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  rides: [ride({ seatsTotal: 3, seatsAvailable: 2 })],
  bookings: [booking()],
  users: [
    user({ id: "u-driver", displayName: "Rezaul Karim", department: "Finance" }),
    user({ id: "u-rider", displayName: "Nusrat Jahan", department: "Programmes" }),
  ],
  zones: ZONES,
  ledger: [] as CreditEntry[],
  fuelPrices: FUEL_PRICES,
  generatedAt: "2026-09-04T10:00:00+06:00",
  ...over,
});

describe("buildWorkbook", () => {
  it("produces the five reporting sheets", () => {
    expect(buildWorkbook(input()).map((s) => s.name)).toEqual([
      "Rides", "Bookings", "Balances", "Impact", "Fuel prices",
    ]);
  });

  it("resolves zone and user ids to readable names", () => {
    const rides = buildWorkbook(input())[0]!;
    expect(rides.rows[0]).toMatchObject({
      driver: "Rezaul Karim",
      department: "Finance",
      from: "Uttara",
      to: "Gulshan-2",
    });
    expect(String(rides.rows[0]!["via"])).toContain("Khilkhet");
  });

  it("carries the fuel price that applied, not a live lookup", () => {
    expect(buildWorkbook(input())[0]!.rows[0]).toMatchObject({
      fuelPriceId: "fp-octane-2026-06",
    });
  });

  it("exposes the taxi-guideline ratio as the regulatory evidence pack", () => {
    const row = buildWorkbook(input())[0]!.rows[0]!;
    // Tk 85 for 2 km + Tk 34/km after, over 14 km = Tk 493.
    expect(row["taxiFare"]).toBe(493);
    expect(row["taxiRatio"]).toBeCloseTo(70 / 493, 3);
    expect(row["taxiRatio"] as number).toBeLessThan(0.25);
  });

  it("marks migrated legacy rows so they never read as adoption", () => {
    const w = buildWorkbook(input({ rides: [ride({ provenance: "legacy-2023" })] }));
    expect(w[0]!.rows[0]).toMatchObject({ provenance: "legacy-2023" });
    expect(buildWorkbook(input())[0]!.rows[0]).toMatchObject({ provenance: "app" });
  });

  it("records how each rider would otherwise have travelled", () => {
    expect(buildWorkbook(input())[1]!.rows[0]).toMatchObject({ counterfactualMode: "bus" });
  });

  it("counts only car trips as cars taken off the road", () => {
    // Counting bus and rickshaw switchers would overstate the case, which is
    // the very criticism this sheet exists to answer honestly.
    const w = buildWorkbook(
      input({
        bookings: [
          booking({ id: "b1", counterfactualMode: "own_car" }),
          booking({ id: "b2", counterfactualMode: "ride_hailing" }),
          booking({ id: "b3", counterfactualMode: "bus" }),
          booking({ id: "b4", counterfactualMode: "rickshaw_cng" }),
          booking({ id: "b5", counterfactualMode: "would_not_travel" }),
        ],
      }),
    );
    const impact = w[3]!;
    const avoided = impact.rows.reduce((s, r) => s + (r["avoided"] as number), 0);
    expect(avoided).toBe(2);
    expect(impact.rows.find((r) => r["mode"] === "bus")).toMatchObject({ avoided: 0, share: "20%" });
  });

  it("lists only colleagues who actually gave or took a ride", () => {
    const ledger: CreditEntry[] = [
      { id: "ce-1", bookingId: "bk-1", fromUserId: "u-rider", toUserId: "u-driver", amount: 70, createdAt: "2026-09-04T08:00:00+06:00" },
    ];
    const balances = buildWorkbook(input({ ledger }))[2]!;
    expect(balances.rows).toHaveLength(2);
    expect(balances.rows.find((r) => r["name"] === "Rezaul Karim")).toMatchObject({ given: 1, net: 70 });
    expect(balances.rows.find((r) => r["name"] === "Nusrat Jahan")).toMatchObject({ taken: 1, net: -70 });
  });

  it("omits reversed ledger entries from balances", () => {
    const ledger: CreditEntry[] = [
      { id: "ce-1", bookingId: "bk-1", fromUserId: "u-rider", toUserId: "u-driver", amount: 70, createdAt: "x", reversedBy: "ce-2" },
    ];
    expect(buildWorkbook(input({ ledger }))[2]!.rows).toHaveLength(0);
  });

  it("keeps every dated fuel price, so history stays auditable", () => {
    const fuel = buildWorkbook(input())[4]!;
    expect(fuel.rows.length).toBe(FUEL_PRICES.length);
    expect(fuel.rows.find((r) => r["id"] === "fp-octane-2026-02")).toMatchObject({
      pricePerLitre: 120,
    });
  });

  it("handles an empty organisation without throwing", () => {
    const w = buildWorkbook(input({ rides: [], bookings: [], users: [] }));
    expect(w).toHaveLength(5);
    for (const s of w) expect(Array.isArray(s.rows)).toBe(true);
  });
});

describe("exportFilename", () => {
  it("carries the snapshot date so exports never overwrite each other", () => {
    expect(exportFilename("2026-09-04T10:00:00+06:00")).toBe("ekpothe-export-2026-09-04.xlsx");
  });
});
