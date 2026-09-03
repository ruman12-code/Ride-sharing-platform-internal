# ADR-001 — Architecture

- **Status:** Accepted for Phase 1
- **Date:** 2026-09-03
- **Supersedes:** the `.xlsm` workbook audited in [`LEGACY_AUDIT.md`](LEGACY_AUDIT.md)

## Context

An internal carpooling tool for a single organisation in Dhaka, under 150 staff,
replacing a macro-enabled Excel workbook that ran Aug 2023 – Jan 2024.

Confirmed with the sponsor:

| | |
|---|---|
| Platform | Microsoft 365 — Teams, SharePoint, Entra ID |
| Deploy rights | **Full, held by the sponsor.** App catalogue and Entra app registration both available |
| Headcount | **Under 150** |
| Corridors | Uttara / Khilkhet / 300-Feet → Gulshan · Mirpur → Gulshan · Gulshan → Dhanmondi / Mohammadpur |
| Reference product | mitfahrgelegenheit.de |

Established from the workbook itself, not from the brief:

- **20 real postings, not ~95.** 74 of the 95 used rows are empty.
- **0.185 postings per working day**, not 0.6.
- **10 of 20 rows are test data** from fictional personas.
- **Zero corridor matches** among real colleagues in five months.
- **45% of postings are re-entries of a route the poster had already described.**
- No price field, no booking mechanism, and `Contact number` empty in all 20 rows
  — so the tool could not have produced a completed trip even on a match.

## Decision

### 1. Track A — SPFx web part surfaced as a Teams tab

React + TypeScript, data in SharePoint Lists via PnPjs, identity from Entra ID,
notifications via Power Automate / Graph into Teams.

The sponsor holds deploy rights themselves, which removes the single largest
delivery risk: an unowned notification flow. Track A is chosen because it is the
only option that satisfies **zero-install, zero-login** natively — the app
inherits the Teams session, so there is no new password and nothing to download.
That directly answers the access-path failure the audit documents (A-01, A-02).

### 2. Domain core first, storage-agnostic

```
domain/ → pure TS, no I/O, no framework, 100% unit-tested
ports/  → RideStore, BookingStore, UserDirectory, Notifier, Clock, LedgerStore
adapters/ → sharepoint | graph-excel | local-json
```

SharePoint Lists are a constrained store: no transactions, no foreign keys,
throttling under load, 5,000-item view threshold. Keeping business logic above
the port boundary means those constraints shape one adapter, not the product. If
SharePoint proves unworkable the adapter is replaced and the domain is untouched.

### 3. The recurring commute is the primary entity

`CommuteProfile` generates `Ride` instances for 14 days; the driver's daily
interaction is one tap in a notification.

**This is the decision the audit most directly supports.** Nine of twenty
postings are re-entries. One poster typed the same Empori→300 Feet trip five
times under four spellings. Re-entry consumed 45% of all effort ever spent on
the tool. One-off rides stay possible — the file contains a Dhaka→Chattogram
trip at 1am — but recurring is the default path, not an advanced feature.

### 4. Notification-first

Every core loop completable without opening the app: publish, request, accept,
reconfirm at T−45min, rate. Idempotent, expiring.

### 5. Cost sharing with an un-overridable cap

`sharePerSeat = floorToNearest10(tripCost ÷ (1 + riders))`. Dividing by
occupants *including the driver* means the driver always pays a share and
`driverRecovery < tripCost` for all valid inputs — profit is arithmetically
impossible, and a property-based test asserts it.

This is the same control mitfahrgelegenheit.de (and BlaBlaCar after it) used to
remain a cost-sharing service rather than commercial passenger transport: cap the
per-seat contribution below cost recovery so the activity cannot be a business.
Adopting a control with an established precedent in a comparable regulatory
argument is deliberate.

Fuel price and km/L are **dated, versioned records**, never constants. Every
`Ride` stores the `fuelPriceId` that applied on its date, so history is never
recomputed against today's price.

### 6. Credit ledger, no money movement

Credits are not purchasable and not redeemable for cash. That is what keeps the
product outside Bangladesh Bank's payment regime, and it is stated in the code so
nobody "improves" it later. No wallets, no top-ups, no gateways.

### 7. Success is measured on completed trips, not matches

The liquidity baseline is **0** and, at 15 postings over 12 dates, it had almost
no power to detect a match under any demand hypothesis. It therefore cannot be
improved on measurably.

**The brief's premise — "it did not fail for lack of demand" — is an assumption,
not a finding.** Both explanations (nobody could reach it; nobody wanted it)
predict the artefact we hold. We proceed anyway, because removing the documented
friction is correct under either hypothesis. But we instrument to find out which
is true: notification click-through tests the access-path diagnosis, and
zero-result search logs plus standing "Alert me" records build the demand map the
legacy file could not.

## Rejected options

| Option | Why rejected |
|---|---|
| **Track B — keep Excel/VBA** | Reproduces the exact failure mode. Requires desktop Excel, a download, and a macro warning; unusable on a phone. Would also re-inherit L-04, the `lastRow + 1` overwrite. Not viable, and deploy rights make it unnecessary. |
| **Track A-fallback — static app in a document library** | Only justified without deploy rights. Notifications would depend on a flow owned by someone else, making the core feature an organisational single point of failure. |
| **Standalone web app with its own auth** | A new password is a new access barrier. Directly contradicts zero-login, which is the lesson of the audit. |
| **Copy mitfahrgelegenheit.de's market model** | Its **UX** is the right reference — from/to/date search, driver profiles, ratings, cost-share framing. Its **market structure** is not transferable: it worked on millions of users, where any corridor has supply at any hour. Under 150 staff with ~25 drivers is a different problem, and the same interface without the density produces an empty marketplace. Hence recurring profiles, standing demand records, and visible-liquidity cues, which a public market does not need. |
| **Paid map API for matching in Phase 1** | Cost and a third-party data-sharing question for a 150-person pilot. Corridor matching over a seeded zone graph is sufficient; the port stays clean for a Mapbox or Barikoi adapter later. |
| **Free-text locations** | Directly refuted by D-04: one user produced four spellings of one destination in five months. |
| **Wallets or in-app payment** | Licensing exposure with no Phase-1 benefit. |

## Consequences

**Accepted.** Tied to the Microsoft 365 tenant. SPFx has a real learning curve and
its build toolchain ages quickly. SharePoint Lists impose the constraints in §2.
Notification delivery depends on Power Automate/Graph remaining available.

**Bus factor is a named risk.** The legacy tool was unmaintainable because it
existed as undocumented VBA in one person's head — and it shipped with a module
that did not compile, three procedures sharing one name, and a commented-out line
that silently discarded user input for five months. Every one of those is a
symptom of code nobody else ever read. Hence: `README.md`, `docs/RUNBOOK.md`,
100% domain unit coverage, conventional commits, and a justification in the
commit message for every dependency added.

## What would reverse this

| Trigger | Response |
|---|---|
| Deploy rights withdrawn | Track A-fallback. Domain core unchanged; adapter and notifier swapped. |
| Organisation leaves M365 | Ports hold. Rewrite adapters and the notifier only. |
| SharePoint throttling or the 5,000-item threshold bites | Replace the adapter with Dataverse or a hosted DB. No domain change. |
| Notification click-through is high but trips stay near zero | The access-path diagnosis was right and **liquidity is the binding constraint.** Narrow to one corridor, recruit drivers directly, stop building features. |
| Click-through is low | The tool still is not reaching people. Re-open the delivery channel decision before adding anything else. |
| Requirement appears to hold or transfer value | **Stop.** Licensing question, not an engineering one. Escalate before writing code. |

## Open question blocking the pricing implementation

The brief specifies seeding `FuelPrice` with the rates effective **1 June 2026**
(octane Tk 145, petrol Tk 140, diesel Tk 115) *and* raising an admin alarm when
the active record is more than **35 days old**.

Today is **2026-09-03**. A 1 June record is 94 days old, so the system ships in a
permanently-alarmed state. Under Bangladesh's automatic pricing mechanism the
rate is adjusted periodically, so a June rate is very likely superseded.

This is unresolved and is recorded here rather than guessed at, because a wrong
fuel rate silently mis-prices every ride and corrupts the audit trail the cap
argument depends on. Three ways to close it, for the sponsor to choose:

1. Provide the current gazetted rates and seed those.
2. Seed June deliberately and treat the alarm as a day-one prompt for the admin
   to enter the current rate before the first ride is published.
3. Seed June and widen the alarm threshold — **not recommended**: it suppresses
   the signal rather than the staleness.

The pricing domain is implemented against the `FuelPrice` record either way; only
the seed value is blocked.
