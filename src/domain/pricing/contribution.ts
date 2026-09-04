import type { Taka } from "../types.js";
import { isWithinCap } from "./cost-share.js";

/**
 * What, if anything, a rider gives the driver.
 *
 * The system always works out what an even split of the fuel would be, and
 * always shows it. What it does not do is insist on it. A colleague giving
 * another colleague a lift may want the fuel share, may prefer a coffee, or may
 * want nothing at all — and a tool that forces the first option turns a favour
 * into a transaction.
 *
 * The calculated share stays the **ceiling** in every mode. A driver can go
 * below it or ignore it; there is no path above it.
 */
export type ContributionMode = "cost_share" | "in_kind" | "nothing";

/** Suggestions for the in-kind mode. The driver may also write their own. */
export const IN_KIND_SUGGESTIONS: readonly string[] = [
  "A coffee",
  "A cup of tea",
  "Buy the snacks",
  "Return the favour some day",
];

export interface Contribution {
  readonly mode: ContributionMode;
  /** Taka per seat. Meaningful only when mode is `cost_share`. */
  readonly amount: Taka;
  /** What the driver asked for. Meaningful only when mode is `in_kind`. */
  readonly inKindNote?: string;
}

export const MAX_IN_KIND_NOTE = 60;

/**
 * The recommended default: an even share of the fuel, at the calculated cap.
 *
 * Recommended rather than imposed. Most drivers will accept the default, which
 * is exactly why the default has to be the fair one.
 */
export const recommendedContribution = (cap: Taka): Contribution => ({
  mode: "cost_share",
  amount: cap,
});

/**
 * Is this contribution allowed?
 *
 * The cap is the only hard rule, and it holds in the one mode where money is
 * named. `in_kind` and `nothing` are always permitted: a coffee is not a fare,
 * and neither is nothing.
 */
export const isValidContribution = (c: Contribution, cap: Taka): boolean => {
  switch (c.mode) {
    case "cost_share":
      return isWithinCap(c.amount, cap);
    case "in_kind":
      // Bounded so the field cannot become a notice board, and required so
      // "in kind" always says what is meant.
      return (
        c.amount === 0 &&
        typeof c.inKindNote === "string" &&
        c.inKindNote.trim().length > 0 &&
        c.inKindNote.length <= MAX_IN_KIND_NOTE
      );
    case "nothing":
      return c.amount === 0;
  }
};

/**
 * What a rider sees on the ride card.
 *
 * Deliberately never renders `in_kind` or `nothing` as "Tk 0" — a zero price is
 * still a price, and it frames the lift as a transaction that happens to cost
 * nothing rather than as a colleague doing something decent.
 */
export const contributionLabel = (
  c: Contribution,
  lang: "en" | "bn",
): string => {
  switch (c.mode) {
    case "cost_share":
      return lang === "en" ? `Tk ${c.amount} per seat` : `৳${c.amount} প্রতি সিট`;
    case "in_kind":
      return c.inKindNote ?? (lang === "en" ? "Something small" : "ছোট কিছু");
    case "nothing":
      return lang === "en" ? "Free — just come along" : "বিনামূল্যে — চলে আসুন";
  }
};

/** Only a cost share creates a ledger entry. A coffee is not bookkeeping. */
export const createsLedgerEntry = (c: Contribution): boolean =>
  c.mode === "cost_share" && c.amount > 0;
