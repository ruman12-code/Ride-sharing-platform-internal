import { describe, expect, it } from "vitest";
import {
  type ContactHandle,
  contactCounterparty,
  maskContact,
  mayExchangeContact,
  revealEntry,
} from "./contact-exchange.js";
import type { Booking } from "../entities/booking.js";

const b = (status: Booking["status"]): Pick<Booking, "status" | "riderId"> => ({
  status,
  riderId: "u-rider",
});

describe("mayExchangeContact", () => {
  it("releases only after the driver has accepted", () => {
    expect(mayExchangeContact(b("confirmed"))).toBe(true);
    expect(mayExchangeContact(b("completed"))).toBe(true);
  });

  it("does not release on a mere request", () => {
    // Otherwise anyone could harvest numbers by requesting seats they never take.
    expect(mayExchangeContact(b("requested"))).toBe(false);
  });

  it("does not release once the arrangement is off", () => {
    for (const s of [
      "declined", "cancelled_by_rider", "cancelled_by_driver",
      "no_show_rider", "no_show_driver",
    ] as const) {
      expect(mayExchangeContact(b(s)), s).toBe(false);
    }
  });
});

describe("contactCounterparty", () => {
  it("works both ways between the two people on the booking", () => {
    // The rider needs to say "I'm at the gate"; the driver needs to say
    // "two minutes away". One-way disclosure strands one of them.
    expect(contactCounterparty(b("confirmed"), "u-driver", "u-driver")).toBe("u-rider");
    expect(contactCounterparty(b("confirmed"), "u-driver", "u-rider")).toBe("u-driver");
  });

  it("tells a bystander nothing, even on a confirmed booking", () => {
    expect(contactCounterparty(b("confirmed"), "u-driver", "u-nosy")).toBeUndefined();
  });

  it("tells even the right person nothing before acceptance", () => {
    expect(contactCounterparty(b("requested"), "u-driver", "u-rider")).toBeUndefined();
    expect(contactCounterparty(b("declined"), "u-driver", "u-rider")).toBeUndefined();
  });
});

describe("maskContact", () => {
  const phone = (v: string): ContactHandle => ({ kind: "phone", value: v });

  it("leaves only the last three digits of a number", () => {
    expect(maskContact(phone("01712345678"))).toBe("••••••••678");
  });

  it("ignores punctuation when counting digits", () => {
    // 13 digits in, three shown, ten masked.
    expect(maskContact(phone("+880 17-1234 5678"))).toBe("••••••••••678");
  });

  it("reveals nothing from a very short value", () => {
    expect(maskContact(phone("12"))).toBe("•••");
  });

  it("keeps an email's domain, so it is recognisable but not usable", () => {
    expect(maskContact({ kind: "email", value: "nusrat.jahan@example.org" })).toBe(
      "nu••••••••••@example.org",
    );
  });
});

describe("revealEntry", () => {
  it("records who saw whose details, and when", () => {
    // So that "who has my number?" has an answer rather than an assumption.
    expect(revealEntry("bk-1", "u-rider", "u-driver", "2026-09-04T08:00:00+06:00")).toEqual({
      bookingId: "bk-1",
      viewerId: "u-rider",
      subjectId: "u-driver",
      at: "2026-09-04T08:00:00+06:00",
    });
  });
});
