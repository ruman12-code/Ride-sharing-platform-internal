# Ekpothe (একপথে) — *on one path*

Ride sharing for colleagues, in Dhaka. Built for us, by Ruman.

Replaces the macro-enabled Excel workbook that ran Aug 2023 – Jan 2024.

**Status: steps 1–9 of the build order complete, against the `local-json`
adapter.** 152 unit tests and 10 browser tests passing.

**The Microsoft 365 deployment is not built.** Everything runs in memory, so
nothing persists between refreshes. See [`docs/INSTALL.md`](docs/INSTALL.md) §3.

```bash
npm install && npm run dev     # the app alone, at localhost:5173 (nothing saved)
npm start                      # the pilot: app + server + SQLite, at localhost:8080
npm test                       # 162 unit tests
npm run test:e2e               # 10 browser tests at 360px
npm run typecheck              # TypeScript strict
```

**New here?** [`docs/INSTALL.md`](docs/INSTALL.md) to run it ·
[`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) to use it

## Why this exists

The workbook was an `.xlsm` in a SharePoint folder. Posting a ride meant finding
the folder, downloading the file, opening it in desktop Excel (macros do not run
in Excel for the web), clicking past a macro-security warning, and using a
UserForm — none of it possible from a phone.

The audit found the access path was not the only problem:

- **20 real postings, not ~95.** 74 of 95 used rows are empty.
- **10 of 20 rows are test data** from fictional personas.
- **`Contact number` is empty in all 20 rows** — there was no way to reach a
  driver even on a match.
- The working submit handler had the `Route` write **commented out**, silently
  discarding that field for five months.
- **Zero corridor matches** among real colleagues.

Read [`docs/LEGACY_AUDIT.md`](docs/LEGACY_AUDIT.md) before changing anything.

## Documents

| Document | Contents |
|---|---|
| [`docs/LEGACY_AUDIT.md`](docs/LEGACY_AUDIT.md) | Every field, every macro, every defect, per-row migration disposition |
| [`docs/LIQUIDITY_BASELINE.md`](docs/LIQUIDITY_BASELINE.md) | The "before" measurement, and why it cannot carry the weight the brief puts on it |
| [`docs/ADR-001-architecture.md`](docs/ADR-001-architecture.md) | Decision, rejected options, what would reverse it |
| [`docs/ADR-002-routing.md`](docs/ADR-002-routing.md) | Computed routing, and why Google Maps is built but disabled |
| [`docs/ADR-003-name-and-attribution.md`](docs/ADR-003-name-and-attribution.md) | The name, and the acrostic |
| [`server/README.md`](server/README.md) | The pilot server — running it without SharePoint |
| [`docs/HOSTING.md`](docs/HOSTING.md) | Getting it online with HTTPS, from scratch |
| [`docs/DATA_SECURITY.md`](docs/DATA_SECURITY.md) | What happens to colleagues' data — written to hand over |
| [`docs/INSTALL.md`](docs/INSTALL.md) | How to run it, and what does not work yet |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | For colleagues and administrators |
| [`docs/DPIA.md`](docs/DPIA.md) | Data protection impact assessment — **unsigned** |
| [`docs/PRIVACY_NOTICE.md`](docs/PRIVACY_NOTICE.md) | English and Bangla |

## Reproducing the audit

```bash
pip install oletools openpyxl
python3 tools/audit_legacy.py legacy/Ride_sharing_platformFinal29012024.xlsm
python3 tools/liquidity_baseline.py
```

Writes to `out/` (git-ignored, fully regenerable). The workbook is opened
read-only and never written to — it is evidence.

## Planned architecture

Track A: SPFx web part surfaced as a Teams tab. React + TypeScript, data in
SharePoint Lists via PnPjs, identity from Entra ID, notifications via Power
Automate / Graph into Teams. Zero install, zero login, phone-first.

```
src/
  domain/     pure TS, no I/O, no framework, 100% unit-tested
  ports/      RideStore, BookingStore, UserDirectory, Notifier, Clock, LedgerStore
  adapters/   sharepoint | graph-excel | local-json
  ui/         React + TypeScript
  export/     Excel export — reporting artefact, never the transactional store
```

## Build order

1. ✅ Legacy audit, liquidity baseline, ADR
2. ✅ Domain core + tests (pricing, cap, ledger, concurrency)
3. ✅ `local-json` adapter, seeded zone graph
4. ✅ Offer flow → Find flow → booking with concurrency
5. ✅ Recurring commute profiles + notification loop
6. ✅ Ratings, incidents, credit ledger UI
7. ⚠️ Excel export ✅ · **SharePoint/Graph adapter not built**
8. ✅ Admin + metrics dashboard
9. ⚠️ E2E ✅ · accessibility ✅ · DPIA ✅ (unsigned) · **load test not run**

### What is genuinely outstanding

| Gap | Consequence |
|---|---|
| **SharePoint/Graph adapter** | Not built — but no longer blocking. The [pilot server](server/README.md) stores data in SQLite and needs no SharePoint, so this can go in front of colleagues now. |
| **Teams tab + Power Automate flows** | The notification loop is composed and tested but has no delivery channel wired. |
| **Load test at 20× peak** | Not run. At ~150 staff, peak is perhaps 15 concurrent users, so this is low risk — but it is not done. |
| **DPIA signature** | Drafted, unsigned. Needs an owner and legal review before real data. |

The domain core does not change when those land. That is what the port boundary
is for.

## Routing

There are no pre-defined corridors. A colleague picks any origin and any
destination and the route is computed between them, so a journey nobody
anticipated works as well as the ones everybody expected. Every zone along a
computed route is a valid pick-up and drop-off point.

The default planner runs locally over a zone graph — no network, no cost, no
journey data leaving the tenant. A Google Directions adapter is built and
**disabled**; see [ADR-002](docs/ADR-002-routing.md) for why enabling it is an
organisational decision rather than a config flag.

## Non-negotiables

Carried from the brief and reinforced by the audit. Each maps to a defect in
`LEGACY_AUDIT.md` §6.

- No free-text locations anywhere — seeded `Zone` table with aliases (D-04)
- No path that exceeds the cost-share cap — not driver, not admin, not config (D-09)
- No money movement, wallets, top-ups or cashable credits — licensing boundary
- No silently swallowed concurrency conflicts (L-04)
- No phone numbers before a confirmed booking; every reveal audit-logged (D-05, D-06)
- No driver/rider role split at signup — many colleagues are both
- The counterfactual-mode question is never dropped to save a tap
- Nothing ships that requires the user to remember to open it (A-02)
- No free-text place names — the picker filters a closed, seeded set
- The declaration from the legacy entry form stays verbatim and visible while
  entering data: *"You are entering your Ride sharing information by yourself,
  voluntarily"*
