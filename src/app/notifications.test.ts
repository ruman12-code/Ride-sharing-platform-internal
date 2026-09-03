import { describe, expect, it } from "vitest";
import {
  driverBookingRequest,
  driverPublishPrompt,
  postTripRating,
  publishPromptAt,
  reconfirm,
  reconfirmAt,
  riderMatchFound,
  weeklyDigest,
} from "./notifications.js";
import { ride, user } from "../test/factories.js";
import { RecordingNotifier } from "../adapters/local-json/memory-store.js";
import type { Booking } from "../domain/entities/booking.js";

const driver = user({ id: "u-driver", displayName: "Rezaul Karim" });
const rider = user({ id: "u-rider", displayName: "Nusrat Jahan" });
const booking: Booking = {
  id: "bk-1", rideId: "ride-1", riderId: "u-rider",
  boardZoneId: "khilkhet", alightZoneId: "gulshan-2", seats: 1,
  status: "requested", amount: 70, settlementMode: "credit_ledger",
  counterfactualMode: "bus", idempotencyKey: "k1", rowVersion: 1,
};

/**
 * The product's core claim is that a colleague never has to open the app. These
 * tests hold that line: every notification must carry an action that completes
 * the loop, not a link that defers it.
 */
describe("every notification completes its loop without opening the app", () => {
  const all = [
    driverPublishPrompt(ride(), "Uttara → Gulshan"),
    riderMatchFound(ride(), driver, "u-rider", "Uttara → Gulshan"),
    driverBookingRequest(booking, ride(), rider, "Khilkhet"),
    reconfirm(ride(), "u-rider", "Rezaul Karim"),
    postTripRating(booking, "Rezaul Karim"),
    weeklyDigest("u-rider", { savedTaka: 340, tripsTaken: 3, driversOnYourCorridor: 4, unfilledSeats: 2 }, "2026-09-03T17:00:00+06:00"),
  ];

  it("carries at least one action", () => {
    for (const n of all) expect(n.actions.length).toBeGreaterThan(0);
  });

  it("expires, so a stale prompt cannot be actioned later", () => {
    for (const n of all) expect(n.expiresAt).toBeTruthy();
  });

  it("has a stable id, so a re-send is a no-op rather than a second buzz", async () => {
    const notifier = new RecordingNotifier();
    await notifier.send(all[0]!);
    await notifier.send(all[0]!);
    expect(notifier.sent).toHaveLength(1);
  });

  it("never offers 'open the app' as its only action", () => {
    for (const n of all) {
      expect(n.actions.every((a) => /open|view app/i.test(a.label))).toBe(false);
    }
  });
});

describe("driverPublishPrompt", () => {
  it("publishes the seats in one tap and names the count", () => {
    const n = driverPublishPrompt(ride({ seatsTotal: 2 }), "Uttara → Gulshan");
    expect(n.title).toBe("Driving Uttara → Gulshan tomorrow 07:45?");
    expect(n.actions[0]?.label).toBe("Yes, 2 seats");
    expect(n.actions.map((a) => a.label)).toContain("Not tomorrow");
  });

  it("is scheduled 14 hours ahead", () => {
    // 07:45 Dhaka on the 4th, less 14 hours, is 17:45 Dhaka on the 3rd.
    expect(publishPromptAt(ride())).toBe("2026-09-03T17:45:00+06:00");
  });
});

describe("riderMatchFound", () => {
  it("names the driver, the time and the cost share", () => {
    const n = riderMatchFound(ride(), driver, "u-rider", "Uttara → Gulshan");
    expect(n.title).toContain("Rezaul Karim");
    expect(n.body).toContain("07:45");
    expect(n.body).toContain("Tk 70");
    expect(n.actions[0]?.label).toBe("Request seat");
  });
});

describe("driverBookingRequest", () => {
  it("says who and where, and offers accept or decline inline", () => {
    const n = driverBookingRequest(booking, ride(), rider, "Khilkhet");
    expect(n.title).toBe("Nusrat Jahan wants a seat");
    expect(n.body).toContain("Khilkhet");
    expect(n.actions.map((a) => a.label)).toEqual(["Accept", "Decline"]);
  });

  it("goes to the driver, never to anyone else", () => {
    expect(driverBookingRequest(booking, ride(), rider, "Khilkhet").recipientId).toBe("u-driver");
  });
});

describe("reconfirm", () => {
  it("is scheduled 45 minutes ahead, the main no-show defence", () => {
    expect(reconfirmAt(ride())).toBe("2026-09-04T07:00:00+06:00");
  });

  it("is addressed to each side separately, with its own id", () => {
    const a = reconfirm(ride(), "u-rider", "Rezaul Karim");
    const b = reconfirm(ride(), "u-driver", "Nusrat Jahan");
    expect(a.id).not.toBe(b.id);
    expect(a.recipientId).toBe("u-rider");
    expect(b.recipientId).toBe("u-driver");
  });
});

describe("postTripRating", () => {
  it("offers all five stars inline", () => {
    const n = postTripRating(booking, "Rezaul Karim");
    expect(n.actions).toHaveLength(5);
    expect(n.actions[4]?.label).toBe("★★★★★");
  });
});

describe("weeklyDigest", () => {
  it("leads with what the colleague did, then what is available", () => {
    const n = weeklyDigest(
      "u-rider",
      { savedTaka: 340, tripsTaken: 3, driversOnYourCorridor: 4, unfilledSeats: 2 },
      "2026-09-03T17:00:00+06:00",
    );
    expect(n.title).toBe("You shared 3 trips this week");
    expect(n.body).toContain("Tk 340");
    expect(n.body).toContain("2 seats still empty");
  });

  it("is singular for one trip, and omits empty seats when there are none", () => {
    const n = weeklyDigest(
      "u-rider",
      { savedTaka: 90, tripsTaken: 1, driversOnYourCorridor: 2, unfilledSeats: 0 },
      "2026-09-03T17:00:00+06:00",
    );
    expect(n.title).toBe("You shared 1 trip this week");
    expect(n.body).not.toContain("empty");
  });

  it("is deduplicated per week, not per send", () => {
    const a = weeklyDigest("u-1", { savedTaka: 1, tripsTaken: 1, driversOnYourCorridor: 1, unfilledSeats: 0 }, "2026-09-03T17:00:00+06:00");
    const b = weeklyDigest("u-1", { savedTaka: 9, tripsTaken: 9, driversOnYourCorridor: 9, unfilledSeats: 9 }, "2026-09-03T21:00:00+06:00");
    expect(a.id).toBe(b.id);
  });
});
