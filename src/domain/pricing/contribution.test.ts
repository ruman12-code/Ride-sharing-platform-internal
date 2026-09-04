import { describe, expect, it } from "vitest";
import {
  type Contribution,
  MAX_IN_KIND_NOTE,
  contributionLabel,
  createsLedgerEntry,
  isValidContribution,
  recommendedContribution,
} from "./contribution.js";

const CAP = 70;

describe("recommendedContribution", () => {
  it("recommends an even fuel share at the calculated cap", () => {
    // Most drivers accept the default, which is why the default must be fair.
    expect(recommendedContribution(CAP)).toEqual({ mode: "cost_share", amount: 70 });
  });
});

describe("isValidContribution", () => {
  it("accepts a cost share at or below the cap, including zero", () => {
    for (const amount of [0, 10, 40, CAP]) {
      expect(isValidContribution({ mode: "cost_share", amount }, CAP)).toBe(true);
    }
  });

  it("refuses a cost share above the cap — the ceiling holds in every mode", () => {
    expect(isValidContribution({ mode: "cost_share", amount: CAP + 10 }, CAP)).toBe(false);
    expect(isValidContribution({ mode: "cost_share", amount: 9999 }, CAP)).toBe(false);
  });

  it("accepts an in-kind ask with a note", () => {
    expect(
      isValidContribution({ mode: "in_kind", amount: 0, inKindNote: "A coffee" }, CAP),
    ).toBe(true);
  });

  it("refuses in-kind without a note, so it always says what is meant", () => {
    expect(isValidContribution({ mode: "in_kind", amount: 0 }, CAP)).toBe(false);
    expect(
      isValidContribution({ mode: "in_kind", amount: 0, inKindNote: "   " }, CAP),
    ).toBe(false);
  });

  it("refuses an in-kind note long enough to be a notice board", () => {
    expect(
      isValidContribution(
        { mode: "in_kind", amount: 0, inKindNote: "x".repeat(MAX_IN_KIND_NOTE + 1) },
        CAP,
      ),
    ).toBe(false);
  });

  it("refuses an in-kind ask that also names money", () => {
    // "A coffee AND Tk 50" is a fare wearing a disguise.
    expect(
      isValidContribution({ mode: "in_kind", amount: 50, inKindNote: "A coffee" }, CAP),
    ).toBe(false);
  });

  it("accepts nothing, and refuses 'nothing' that carries an amount", () => {
    expect(isValidContribution({ mode: "nothing", amount: 0 }, CAP)).toBe(true);
    expect(isValidContribution({ mode: "nothing", amount: 20 }, CAP)).toBe(false);
  });

  it("never allows any mode to exceed the cap", () => {
    const modes: Contribution[] = [
      { mode: "cost_share", amount: 500 },
      { mode: "in_kind", amount: 500, inKindNote: "A coffee" },
      { mode: "nothing", amount: 500 },
    ];
    for (const c of modes) expect(isValidContribution(c, CAP)).toBe(false);
  });
});

describe("contributionLabel", () => {
  it("names the amount for a cost share, in both languages", () => {
    expect(contributionLabel({ mode: "cost_share", amount: 70 }, "en")).toBe("Tk 70 per seat");
    expect(contributionLabel({ mode: "cost_share", amount: 70 }, "bn")).toBe("৳70 প্রতি সিট");
  });

  it("shows what was asked for in kind", () => {
    expect(
      contributionLabel({ mode: "in_kind", amount: 0, inKindNote: "A coffee" }, "en"),
    ).toBe("A coffee");
  });

  it("never renders a free ride as 'Tk 0'", () => {
    // A zero price is still a price. It frames a favour as a transaction.
    const label = contributionLabel({ mode: "nothing", amount: 0 }, "en");
    expect(label).not.toContain("0");
    expect(label).toBe("Free — just come along");
  });
});

describe("createsLedgerEntry", () => {
  it("records a cost share", () => {
    expect(createsLedgerEntry({ mode: "cost_share", amount: 70 })).toBe(true);
  });

  it("does not record a coffee, or nothing — neither is bookkeeping", () => {
    expect(createsLedgerEntry({ mode: "in_kind", amount: 0, inKindNote: "A coffee" })).toBe(false);
    expect(createsLedgerEntry({ mode: "nothing", amount: 0 })).toBe(false);
    expect(createsLedgerEntry({ mode: "cost_share", amount: 0 })).toBe(false);
  });
});
