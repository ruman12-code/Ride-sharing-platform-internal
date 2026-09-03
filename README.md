# Internal carpooling — organisation ride sharing, Dhaka

Replaces the macro-enabled Excel workbook that ran Aug 2023 – Jan 2024.

**Status: Step 1 of 9 complete** — legacy audit, liquidity baseline and
architecture decision. No application code yet; the domain core is next and is
gated on the sponsor checkpoint recorded in `docs/ADR-001-architecture.md`.

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

1. ✅ Legacy audit, liquidity baseline, ADR — **sponsor checkpoint**
2. ⬜ Domain core + tests (pricing, cap, ledger, concurrency). No UI — **sponsor checkpoint**
3. ⬜ `local-json` adapter, seeded zone graph, migrated legacy data
4. ⬜ Offer flow → Find flow → booking with concurrency
5. ⬜ Recurring commute profiles + notification loop — **sponsor checkpoint**
6. ⬜ Ratings, incidents, credit ledger UI
7. ⬜ Production adapter + Excel export
8. ⬜ Admin + metrics dashboard
9. ⬜ E2E, load test, accessibility audit, DPIA

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
