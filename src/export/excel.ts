import type { Booking } from "../domain/entities/booking.js";
import type { CreditEntry } from "../domain/entities/ledger.js";
import type { Ride } from "../domain/entities/ride.js";
import type { User } from "../domain/entities/user.js";
import type { Zone } from "../domain/entities/zone.js";
import { taxiGuidelineFare, taxiRatio } from "../domain/pricing/cost-share.js";
import type { FuelPrice } from "../domain/pricing/fuel.js";
import { balanceFor } from "../domain/entities/ledger.js";

/**
 * Excel export.
 *
 * Excel remains the organisation's reporting artefact and always will be —
 * people know it, it opens on any machine, and it is what gets attached to a
 * mail. What changed is that it is **never the transactional store**. The
 * legacy workbook was both, which is why two colleagues submitting at once
 * silently overwrote each other (LEGACY_AUDIT.md L-04).
 *
 * Every export is a snapshot, generated on demand, and nothing reads it back.
 */

export interface ExportInput {
  readonly rides: readonly Ride[];
  readonly bookings: readonly Booking[];
  readonly users: readonly User[];
  readonly zones: readonly Zone[];
  readonly ledger: readonly CreditEntry[];
  readonly fuelPrices: readonly FuelPrice[];
  readonly generatedAt: string;
}

export interface Sheet {
  readonly name: string;
  readonly columns: readonly { readonly header: string; readonly key: string; readonly width: number }[];
  readonly rows: readonly Record<string, unknown>[];
}

/**
 * The workbook, as plain data.
 *
 * Kept separate from any Excel library so the shape is unit-testable without a
 * binary, and so swapping the writer never risks changing the content.
 */
export const buildWorkbook = (input: ExportInput): readonly Sheet[] => {
  const zoneName = (id: string) => input.zones.find((z) => z.id === id)?.nameEn ?? id;
  const userName = (id: string) => input.users.find((u) => u.id === id)?.displayName ?? id;
  const rideById = (id: string) => input.rides.find((r) => r.id === id);

  const rides: Sheet = {
    name: "Rides",
    columns: [
      { header: "Ride ID", key: "id", width: 16 },
      { header: "Driver", key: "driver", width: 22 },
      { header: "Department", key: "department", width: 16 },
      { header: "From", key: "from", width: 18 },
      { header: "To", key: "to", width: 18 },
      { header: "Via", key: "via", width: 40 },
      { header: "Departure", key: "departureAt", width: 26 },
      { header: "Distance (km)", key: "distanceKm", width: 13 },
      { header: "Seats total", key: "seatsTotal", width: 11 },
      { header: "Seats available", key: "seatsAvailable", width: 14 },
      { header: "Cost share/seat (Tk)", key: "costShare", width: 19 },
      { header: "Fuel rate (Tk/km)", key: "fuelRate", width: 16 },
      { header: "Fuel price ID", key: "fuelPriceId", width: 22 },
      { header: "Taxi guideline (Tk)", key: "taxiFare", width: 18 },
      { header: "Share ÷ taxi rate", key: "taxiRatio", width: 16 },
      { header: "Status", key: "status", width: 12 },
      { header: "From profile", key: "profileId", width: 14 },
      { header: "Provenance", key: "provenance", width: 14 },
    ],
    rows: input.rides.map((r) => {
      const user = input.users.find((u) => u.id === r.driverId);
      return {
        id: r.id,
        driver: userName(r.driverId),
        department: user?.department ?? "",
        from: zoneName(r.zoneSequence[0] ?? ""),
        to: zoneName(r.zoneSequence.at(-1) ?? ""),
        via: r.zoneSequence.slice(1, -1).map(zoneName).join(" · "),
        departureAt: r.departureAt,
        distanceKm: r.distanceKm,
        seatsTotal: r.seatsTotal,
        seatsAvailable: r.seatsAvailable,
        costShare: r.costSharePerSeat,
        fuelRate: Math.round(r.fuelRatePerKm * 100) / 100,
        fuelPriceId: r.fuelPriceId,
        // The evidence pack for any future regulatory conversation: a share
        // that is a small fraction of the metered rate is visibly not a fare.
        taxiFare: r.distanceKm > 0 ? Math.round(taxiGuidelineFare(r.distanceKm)) : 0,
        taxiRatio:
          r.distanceKm > 0
            ? Math.round(taxiRatio(r.costSharePerSeat, r.distanceKm) * 1000) / 1000
            : 0,
        status: r.status,
        profileId: r.profileId ?? "",
        provenance: r.provenance ?? "app",
      };
    }),
  };

  const bookings: Sheet = {
    name: "Bookings",
    columns: [
      { header: "Booking ID", key: "id", width: 16 },
      { header: "Ride ID", key: "rideId", width: 16 },
      { header: "Rider", key: "rider", width: 22 },
      { header: "Department", key: "department", width: 16 },
      { header: "Board at", key: "board", width: 18 },
      { header: "Alight at", key: "alight", width: 18 },
      { header: "Departure", key: "departureAt", width: 26 },
      { header: "Seats", key: "seats", width: 8 },
      { header: "Amount (Tk)", key: "amount", width: 12 },
      { header: "Settlement", key: "settlementMode", width: 16 },
      { header: "Would otherwise travel by", key: "counterfactualMode", width: 24 },
      { header: "Status", key: "status", width: 18 },
    ],
    rows: input.bookings.map((b) => {
      const user = input.users.find((u) => u.id === b.riderId);
      return {
        id: b.id,
        rideId: b.rideId,
        rider: userName(b.riderId),
        department: user?.department ?? "",
        board: zoneName(b.boardZoneId),
        alight: zoneName(b.alightZoneId),
        departureAt: rideById(b.rideId)?.departureAt ?? "",
        seats: b.seats,
        amount: b.amount,
        settlementMode: b.settlementMode,
        counterfactualMode: b.counterfactualMode,
        status: b.status,
      };
    }),
  };

  const balances: Sheet = {
    name: "Balances",
    columns: [
      { header: "Colleague", key: "name", width: 22 },
      { header: "Department", key: "department", width: 16 },
      { header: "Rides given", key: "given", width: 12 },
      { header: "Rides taken", key: "taken", width: 12 },
      { header: "Net (Tk)", key: "net", width: 12 },
      { header: "Settled batches", key: "batches", width: 20 },
    ],
    rows: input.users
      .map((u) => {
        const b = balanceFor(input.ledger, u.id);
        return {
          name: u.displayName,
          department: u.department,
          given: b.ridesGiven,
          taken: b.ridesTaken,
          net: b.net,
          batches: [
            ...new Set(
              input.ledger
                .filter((e) => (e.toUserId === u.id || e.fromUserId === u.id) && e.settledBatch)
                .map((e) => e.settledBatch!),
            ),
          ].join(", "),
        };
      })
      .filter((r) => r.given > 0 || r.taken > 0),
  };

  /**
   * The counterfactual distribution: the answer to "you are just pulling people
   * off buses". Captured at booking time because it is unrecoverable afterwards.
   */
  const counts = new Map<string, number>();
  for (const b of input.bookings) {
    counts.set(b.counterfactualMode, (counts.get(b.counterfactualMode) ?? 0) + 1);
  }
  const total = input.bookings.length;
  const impact: Sheet = {
    name: "Impact",
    columns: [
      { header: "Would otherwise travel by", key: "mode", width: 26 },
      { header: "Bookings", key: "count", width: 11 },
      { header: "Share", key: "share", width: 10 },
      { header: "Car trips avoided", key: "avoided", width: 18 },
    ],
    rows: [...counts.entries()].map(([mode, count]) => ({
      mode,
      count,
      share: total > 0 ? `${Math.round((count / total) * 100)}%` : "0%",
      // Only "own car" and "ride hailing" represent a car removed from the road.
      // Counting bus or rickshaw switchers here would overstate the case, which
      // is exactly the criticism this sheet exists to answer honestly.
      avoided: mode === "own_car" || mode === "ride_hailing" ? count : 0,
    })),
  };

  const fuel: Sheet = {
    name: "Fuel prices",
    columns: [
      { header: "ID", key: "id", width: 22 },
      { header: "Fuel", key: "fuelType", width: 10 },
      { header: "Tk per litre", key: "pricePerLitre", width: 13 },
      { header: "Effective from", key: "effectiveFrom", width: 15 },
      { header: "Last confirmed", key: "confirmedAt", width: 15 },
      { header: "Source", key: "source", width: 42 },
    ],
    rows: input.fuelPrices.map((f) => ({
      id: f.id,
      fuelType: f.fuelType,
      pricePerLitre: f.pricePerLitre,
      effectiveFrom: f.effectiveFrom,
      confirmedAt: f.confirmedAt ?? "",
      source: f.source,
    })),
  };

  return [rides, bookings, balances, impact, fuel];
};

/** Filename carrying the snapshot date, so exports never overwrite each other. */
export const exportFilename = (generatedAt: string): string =>
  `ekpothe-export-${generatedAt.slice(0, 10)}.xlsx`;
