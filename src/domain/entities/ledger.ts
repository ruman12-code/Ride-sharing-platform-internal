import type { Id, IsoDateTime, Taka } from "../types.js";

/**
 * A record of who owes whom. **No money moves through this platform.**
 *
 * Credits are not purchasable and are not redeemable for cash. That is not a
 * product simplification — it is what keeps this system outside Bangladesh
 * Bank's payment-services regime entirely. A balance here is a reciprocity
 * indicator ("you have given 12 rides and taken 4"), not a debt and not a
 * stored value.
 *
 * DO NOT add top-ups, wallets, cash-out, gateway integration, or any mechanism
 * that holds or transfers value. If a future requirement asks for one, stop and
 * escalate it as a licensing question before writing code. Removing this
 * constraint changes what this software legally is.
 */
export interface CreditEntry {
  readonly id: Id;
  readonly bookingId: Id;
  readonly fromUserId: Id;
  readonly toUserId: Id;
  readonly amount: Taka;
  readonly createdAt: IsoDateTime;
  /** Set when a later entry reverses this one. Entries are never deleted. */
  readonly reversedBy?: Id;
  /** Batch reference once an admin has settled this period. */
  readonly settledBatch?: string;
}

export interface LedgerBalance {
  readonly userId: Id;
  /** Positive: colleagues owe this user. Negative: this user owes colleagues. */
  readonly net: Taka;
  readonly ridesGiven: number;
  readonly ridesTaken: number;
}

/** Net balance for a user, ignoring reversed entries. */
export const balanceFor = (entries: readonly CreditEntry[], userId: Id): LedgerBalance => {
  let net = 0;
  let ridesGiven = 0;
  let ridesTaken = 0;
  for (const e of entries) {
    if (e.reversedBy) continue;
    if (e.toUserId === userId) {
      net += e.amount;
      ridesGiven += 1;
    } else if (e.fromUserId === userId) {
      net -= e.amount;
      ridesTaken += 1;
    }
  }
  return { userId, net, ridesGiven, ridesTaken };
};

/**
 * Reciprocity phrasing for the UI.
 *
 * Deliberately never renders the net figure as money owed. "You have given 12
 * rides and taken 4" is a social signal; "You owe Tk 340" is a debt, and a debt
 * is the thing we are careful not to create.
 */
export const reciprocityLabel = (b: LedgerBalance): string =>
  `You've given ${b.ridesGiven} ${b.ridesGiven === 1 ? "ride" : "rides"}, ` +
  `taken ${b.ridesTaken}.`;
