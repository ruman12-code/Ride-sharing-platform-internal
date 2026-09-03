# Legacy audit — `Ride_sharing_platformFinal29012024.xlsm`

Evidence for every architectural decision that follows. Produced by
`tools/audit_legacy.py`, which reads the workbook without coercing any value, so
a cell containing the text `06:60 am` is recorded as that text rather than
silently parsed or nulled.

| | |
|---|---|
| File | `legacy/Ride_sharing_platformFinal29012024.xlsm` |
| MD5 | `1a8f396d0b530274df888e51b68b1fef` |
| Size | 74,846 bytes |
| Worksheets | `Home`, `Ride_database` |
| VBA modules | 8 (`Module1`–`Module4`, `UserForm1`, `UserForm2`, `ThisWorkbook`, `Sheet4`) |
| Reproduce | `python3 tools/audit_legacy.py legacy/Ride_sharing_platformFinal29012024.xlsm` |

---

## 1. The headline correction

**The workbook holds 20 postings, not ~95.**

`Ride_database` has a used range of `A1:H95`. Ninety-four of those rows are
addressable; **74 are entirely empty**. The 95 figure counts the used range, not
the data. The brief's "~95 postings over five months" overstates real usage by a
factor of 4.75, and every metric derived from it is wrong by the same factor.

| Measure | Brief | Actual |
|---|---:|---:|
| Postings | ~95 | **20** |
| Postings per working day | 0.6 | **0.185** |
| Distinct posters | — | **13 names, of which ~5–6 plausibly real** |
| Rows worth migrating | — | **5 clean, 5 repairable, 10 test data** |

Five months (2023‑08‑23 → 2024‑01‑17) is roughly 108 Sun–Thu working days.
20 ÷ 108 = **0.185 postings per working day** — one posting every 5.4 working
days, from an organisation of under 150 people.

**Why this matters more than any code defect.** The brief opens with "It did not
fail for lack of demand." The data does not support that, and does not refute it
either: with half the rows being test entries from fictional personas, the file
contains no measurement of demand at all. It is the residue of a tool that a
handful of people tried and stopped using. Both explanations — nobody could
reach it, and nobody wanted it — produce exactly this artefact. See
[`LIQUIDITY_BASELINE.md`](LIQUIDITY_BASELINE.md) for why the file cannot
distinguish them, and [`ADR-001`](ADR-001-architecture.md) §7 for what we do
about that.

---

## 2. Field inventory — `Ride_database`

Eight columns. Header row 1, data from row 2.

| Col | Header (verbatim) | Stored type | Filled | Defects | Maps to |
|---|---|---|---:|---|---|
| A | `Starting Time` | text | 20/20 | 6 formats; 1 impossible value | `Ride.departureAt` (time part) |
| B | `Starting Date` | **mixed** date + text | 20/20 | 5 text, 2 locale-transposed | `Ride.departureAt` (date part) |
| C | `Starting Place` | free text | 20/20 | unnormalised | `Ride.zoneSequence[0]` |
| D | `Destination` | free text | 19/20 | unnormalised; carries via-routes | `Ride.zoneSequence[n]` |
| E | `Route` | free text | **7/20** | never written by the working form | `Ride.zoneSequence[1..n-1]` |
| F | `Name of the traveler ` *(trailing space)* | free text | 20/20 | 9 fictional; 1 embedded phone | `Ride.driverId` |
| G | `Contact number` | — | **0/20** | **entirely empty** | `User.phone` |
| H | `Seat Availability` | mixed int + text | 20/20 | 2 non-numeric | `Ride.seatsTotal` |

`Home` is empty (`A4:G18`, no values) — it holds only the macro buttons as shapes.

### Absent fields, confirmed

The brief predicted these; the header row confirms them.

- **No price or cost field of any kind.** Cost sharing was never modelled.
- **No booking mechanism.** No column records who took a seat. No VBA writes one.
  Nothing in the file can establish that a single ride ever happened.
- No entry timestamp, no email, no vehicle, no preferences, no status, no ID.
  Rows have no stable identity — they are addressed only by position.

### Column G is empty in all 20 rows

The only contact detail in the file is one poster who typed their phone into the
**name** field: `Dwaine Bravo (01722334455)`. So even had a colleague found a
matching ride, there was no contact path out of the tool. A matching engine with
no contact channel cannot produce a trip, which is a sufficient explanation on
its own for zero recorded outcomes.

It is also a privacy defect: a phone number in a free-text display field is
visible to every reader of the workbook, with no consent record and no masking.
Carried into `DPIA.md` as finding **DP-01**.

---

## 3. Macro inventory

Full source in `out/vba/`. 25 static findings in `out/audit_summary.json`.

| Module | Lines | Purpose | State |
|---|---:|---|---|
| `Module1` | 7 | Button1/Button3 handlers | **Does not compile** |
| `Module2` | 6 | Button4 → show form | **Broken reference** |
| `Module3` | 44 | Button6 + submit handler (copy 1) | **Fails at runtime** |
| `Module4` | 4 | Button8 → show `UserForm2` | Works |
| `UserForm1` | 55 | Submit form + handler (copy 2) | Works, **drops one field** |
| `UserForm2` | 56 | Search form | Works, wrong algorithm |
| `ThisWorkbook` | 8 | attributes only | — |
| `Sheet4` | 8 | attributes only | **Orphaned** — no such worksheet |

### L-01 — `Module1` cannot compile *(brief: confirmed, and worse)*

```vba
Sub Button1_Click()

End Sub
Sub Button3_Click()
Sub Button1_Click()UserForm.ShowEnd Sub
End Sub
```

Three defects in seven lines:
1. `Sub Button1_Click()` is opened inside `Button3_Click()`. VBA forbids nested
   procedures; the module fails to compile.
2. Line 6 has had its line breaks destroyed — `Sub Button1_Click()`,
   `UserForm.Show` and `End Sub` are concatenated into one statement.
3. It calls `UserForm`, which does not exist. The forms are `UserForm1` and
   `UserForm2`.

A module that does not compile blocks the whole VBA project, so **every macro in
the workbook fails until the user clicks past the resulting error.** This sits
behind the macro-security warning the brief already identifies as a barrier.

### L-02 — `Module3` addresses a sheet that does not exist *(brief: confirmed)*

```vba
Set ws = ThisWorkbook.Sheets("Ride database")   ' actual sheet: Ride_database
```

Space versus underscore. Runtime error 9, subscript out of range. `Module3`'s
submit handler **could never have written a single row.**

### L-03 — Two divergent copies of the submit handler *(brief: confirmed, with a consequence the brief missed)*

`CommandButton1_Click` exists in `Module3` and in `UserForm1` with different
bodies. The differences are not cosmetic:

| | `Module3` | `UserForm1` |
|---|---|---|
| Sheet | `"Ride database"` — broken | `"Ride_database"` — correct |
| Writes column E (`Route`) | yes | **commented out** |
| Confirmation text | "Data inserted successfully!" | "Thank you Dear Colleague…" |

```vba
' UserForm1, the handler that actually runs:
    ws.Cells(lastRow + 1, "D").Value = TextBox4.Value
    ' ws.Cells(lastRow + 1, "E").Value = TextBox5.Value   <-- disabled
    ws.Cells(lastRow + 1, "F").Value = TextBox6.Value
```

**This is why `Route` is empty in 13 of 20 rows.** The brief attributes the
missing routes to users skipping the field ("a third of legacy rows had no route
at all"). They are missing because *the only working submit path silently
discarded them*, and the form cleared the box afterwards so nobody could tell.
The real rate is 65%, not a third.

The correction matters for design: the brief's remedy — pre-populate the
via-zones from the corridor graph so users are not facing a blank box — is right
for a different reason than stated. Users were not lazy; the tool ate their
input. Which means a pre-populated field must also be *verifiably persisted*,
and the integration tests must assert the round trip.

`CommandButton1_Click` is defined a third time in `UserForm2`, where it does
something unrelated (`Unload Me`). Three procedures, one name, three behaviours.

### L-04 — `lastRow + 1` append *(brief: confirmed)*

```vba
lastRow = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row
ws.Cells(lastRow + 1, "A").Value = TextBox1.Value
```

Read-then-write with no lock, no version check, no post-write verification. Two
colleagues submitting against the same copy write the same row; one posting is
lost, and both see "success". This is the exact defect the new system's
optimistic-concurrency invariant and its two-concurrent-bookings test exist to
prevent. **Not to be reproduced in any form, in any track.**

### L-05 — Origin-only substring search *(brief: confirmed)*

`UserForm2.TextBox1_Change` — the entire search:

```vba
For row_no = 2 To .range("C1048576").End(xlUp).Row
  For sr_for = 1 To Len(.Cells(row_no, 3))
    letter = Me.TextBox1.TextLength
    If LCase(Mid(.Cells(row_no, 3), sr_for, letter)) = Me.TextBox1 ...
```

- Reads **column C only** — origin. Destination is never searched, so the
  question a rider actually has ("who is going *where I need to go*?") cannot be
  asked.
- Sliding-window `Mid()` over every character of every cell, re-run on **every
  keystroke**, with the listbox cleared and rebuilt each time. O(rows × chars)
  per keypress, no debounce, no index.
- Unanchored substring: typing `an` matches *B**an**ani*, *Gulsh**an***,
  *Dhanmondi*. No corridor awareness, no time filter, no seat filter.
- No `Option Explicit`; `letter` and `sr_for` are undeclared Variants.
- Row 0 of the results is a fake header row, so result count is always off by one.

### L-06 — Errors are invisible

No `On Error` handling anywhere, and no post-write read-back. Every failure mode
above surfaces as either a VBA error dialog or a silently lost row.

---

## 4. Data-quality defect register

Counts over the 20 data rows.

| Code | Defect | Rows | Example | Disposition |
|---|---|---:|---|---|
| `FICTIONAL_PERSONA` | Poster is not a plausible colleague | **9** | `Spiderman`, `Batman`, `Voyager-1`, `Frank Sinatra` | `discard-as-test` |
| `UNPARSEABLE_TIME` | Time is free text in a non-standard shape | **6** | `7 am`, `8.00 am`, `4.30`, `1 am` | `repair` |
| `TEXT_DATE` | Date stored as text, not a date | **5** | `24/08/2023`, `13/09/23` | `repair` |
| `NON_NUMERIC_SEATS` | Seat count is not an integer | **2** | `plenty` (×2) | `repair` |
| `IMPOSSIBLE_TIME` | Time-shaped text that is not a time | **1** | `06:60 am` | `repair` |
| `PHONE_IN_NAME` | Phone number in the free-text name field | **1** | `Dwaine Bravo (01722334455)` | `repair` + DPIA |
| `BLANK_ROUTE` | Origin or destination empty | **1** | row 12, no destination | `discard-as-test` |

### Six time formats in one column

`08:00` · `7 am` · `8:30 am` · `8.00 am` · `4.30` · `4.30 PM` · `06:60 am`

`4.30` is unresolvable: 4:30 AM and 4:30 PM are both plausible for a Gulshan
commute, and the row gives no basis to choose. Ambiguous times are repaired
under review, never guessed.

### The date column is permanently ambiguous — with two demonstrated casualties

Column B mixes real Excel date serials with `dd/mm/yyyy` **text**. Excel parsed
the text under a US locale. Two rows land outside the campaign window as a
result:

| Row | Stored | Almost certainly meant | Evidence |
|---:|---|---|---|
| 11 | `2023-04-09` (9 Apr) | **4 Sep 2023** | 4½ months before every other row; `04/09/2023` read mm/dd |
| 19 | `2023-01-10` (10 Jan) | **1 Oct 2023** | Sits between the same poster's 27 Sep and 17 Jan runs; `01/10/2023` read mm/dd |

Both are SAM Husain's and Sarwat's recurring Gulshan↔300 Feet runs, which
cluster Aug–Oct 2023. The transposition is legible from context but **not
recoverable from the file**, which is precisely why every date in the new system
is stored as ISO 8601 with an explicit `+06:00` offset and never as locale-
dependent text.

### The recurrence signal — the strongest evidence in the file

| Poster | Postings | Route |
|---|---:|---|
| SAM Husain | **5** | Empori (Gulshan-2) → 300 Feet / Jamuna Future Park |
| Anashua | 2 | Gulshan → Lalmatia via Banani–Mohakhali–Bijoy Sarani–Agargaon |
| Sarwat | 2 | Gulshan Rd 123 → Empori |
| Mr. T | 2 | *(fictional persona)* |

**9 of 20 postings are re-entries of a route the same person had already
posted.** SAM Husain typed essentially the same Empori→300 Feet trip five times
under four different spellings:

> `Notun Baza to Bishow road to 300 feet` · `Khilkhet via Notun Bazar 300 feet` ·
> `Jamuna 300 feet` · `Jamuna Futur Park` · `Jumuna Future Park Express Road (300 Feet)`

Anashua's two rows are the same trip posted **twice on the same date at the same
time** (13/09, `4.30` and `4.30 PM`) with the route spelled differently — a
duplicate, not two trips.

This is the single most useful finding in the workbook, and it directly supports
the brief's central product decision. Even at n=20, **45% of all effort spent on
this tool went into re-typing a trip the user had already described.** Modelling
the recurring commute rather than the individual trip removes that entire class
of work. Note also that free-text entry produced four spellings of one
destination from one person in five months — which is the case for the seeded
zone table with aliases, independent of the friction argument.

---

## 5. Per-row disposition

`migrate` 5 · `repair` 5 · `discard-as-test` 10

| Row | Time | Date | Origin | Destination | Route | Poster | Seats | Defects | Disposition |
|----:|------|------|--------|-------------|-------|--------|------:|---------|-------------|
| 2 | 08:00 | 2023-08-23 | Mirpur | Gulshan-2 | Kalshi-Shamoli-Agargaon-Banani | Spiderman | 2 | FICTIONAL_PERSONA | `discard-as-test` |
| 3 | 7 am | 24/08/2023 | Bashundhara | GIZ Tc office | notun bazar | podda nodir majhi | 1 | UNPARSEABLE_TIME, TEXT_DATE, FICTIONAL_PERSONA | `discard-as-test` |
| 4 | 8:30 am | 2023-08-24 | Marvel studio | DC studio | Fox studio | Batman | 1 | FICTIONAL_PERSONA | `discard-as-test` |
| 5 | 06:60 am | 2023-08-31 | Crypton | Earth | solar system jupter- saturn etc. | Superman | plenty | IMPOSSIBLE_TIME, NON_NUMERIC_SEATS, FICTIONAL_PERSONA | `discard-as-test` |
| 6 | 07:00 am | 2023-08-31 | Uttara | GIZ TC office Gulshan | Uttara-Banani-Gulshan cirle-2 | Mr. T | 2 | FICTIONAL_PERSONA | `discard-as-test` |
| 7 | 11:00 | 29/08/2023 | GULSHAN | MIRPUR |  | Nishat | 1 | TEXT_DATE | `repair` |
| 8 | 06:30 | 2023-08-31 | Mohammadpur | Gulshan-1 | Mohakhali-Banani | Dwaine Bravo (01722334455) | 2 | FICTIONAL_PERSONA, PHONE_IN_NAME | `discard-as-test` |
| 9 | 15:00 | 2023-09-07 | Neptune | Venus | Uranus-Jupiter-Saturn-Mars-Eart... | Voyager-1 | plenty | NON_NUMERIC_SEATS, FICTIONAL_PERSONA | `discard-as-test` |
| 10 | 8.00 am | 31/08/2023 | Gulshan Rd 123 | Empori, TC |  | Sarwat | 2 | UNPARSEABLE_TIME, TEXT_DATE | `repair` |
| 11 | 1 am | 2023-09-07 | Dhaka | Chattogram |  | AJ | 1 | UNPARSEABLE_TIME | `repair` |
| 12 | 8.10 am | 2023-04-09 | Gulshan rd 123 |  |  | Sarwat | 2 | BLANK_ROUTE, UNPARSEABLE_TIME | `discard-as-test` |
| 13 | 5:30 | 2023-08-31 | Empori | Notun Baza to Bishow road to 30... |  | SAM Husain | 2 | — | `migrate` |
| 14 | 17:30 | 2023-09-03 | Empori | Khilkhet via Notun Bazar 300 feet |  | SAM Husain | 2 | — | `migrate` |
| 15 | 5:30 | 2023-09-04 | Empori | Jamuna 300 feet |  | SAM Husain | 2 | — | `migrate` |
| 16 | 08:30 am | 2023-09-15 | Gazipur | Dhanmondi/ Mirpur |  | Mr. T | 2 | FICTIONAL_PERSONA | `discard-as-test` |
| 17 | 4.30 | 13/09/2023 | Gulshan | Banani/Mohakhali/Bijoy Sarani/A... |  | Anashua | 2 | UNPARSEABLE_TIME, TEXT_DATE | `repair` |
| 18 | 4.30 PM | 13/09/23 | Gulshan Empori Financial Tower | Lalmatia via Banani Mohakhali B... |  | Anashua | 2 | UNPARSEABLE_TIME, TEXT_DATE | `repair` |
| 19 | 05:15 | 2023-09-27 | Empori | Jamuna Futur Park |  | SAM Husain | 2 | — | `migrate` |
| 20 | 5:30 | 2023-01-10 | Empori | Jumuna Future Park Express Road... |  | SAM Husain | 2 | — | `migrate` |
| 21 | 17:00 | 2024-01-17 | Gulshan circle 2 | Shodorghat (via DMCC) |  | Frank Sinatra | 0 | FICTIONAL_PERSONA | `discard-as-test` |

### Disposition rules

Applied in order, first match wins. Conservative by design: anything that cannot
be placed on the calendar or the map unambiguously is repaired under human
review, never auto-migrated, because a wrongly-guessed date silently corrupts the
liquidity baseline it feeds.

1. `FICTIONAL_PERSONA` → **`discard-as-test`.** Not a colleague; nothing to migrate.
2. `BLANK_ROUTE` → **`discard-as-test`.** No origin or no destination; nothing to match on.
3. Any typed-field defect (`TEXT_DATE`, `IMPOSSIBLE_TIME`, `UNPARSEABLE_TIME`,
   `NON_NUMERIC_SEATS`, `PHONE_IN_NAME`) → **`repair`.** Queued for review with the
   raw value preserved; the reviewer resolves it, the migration never guesses.
4. Exact duplicate of an earlier row → **`discard-as-test`.**
5. Otherwise → **`migrate`.**

`FICTIONAL_PERSONA` is a judgement, not a heuristic. The eight names are listed
explicitly in `tools/audit_legacy.py` (`FICTIONAL_PERSONAS`) so a reviewer can
challenge any one of them row by row. `Mr. T` is the borderline case — it may be
a real colleague's nickname. It is classified as fictional here; reclassifying it
adds 2 postings to the migrate set and does not change the liquidity result.

### What actually migrates

Five clean postings, plus five repairable, from **five or six real people**.
This is not a migration in any meaningful sense — it is a seed of ~10 rows. Its
value is not the data. It is:

- the **alias list** (`Empori`, `Emporia`, `GIZ TC Office`, `Notun Bazar`,
  `Bishow road`, `Jamuna Futur Park`, `Jumuna`, `Gulshan circle 2`, `300 Feet`)
  which seeds `Zone.aliases[]` directly, and
- the **corridor confirmation** for the three routes named in the brief.

Migrated rows carry `provenance: "legacy-2023"` so they are excluded from
adoption metrics. They must never count toward "rides published" in the
instrumentation, or month 1 will show phantom activity.

---

## 6. Defects → controls

Every finding maps to a named control in the new system. This table is the
audit's reason for existing.

| # | Legacy defect | Control in the new system |
|---|---|---|
| L-01 | `Module1` does not compile, blocking all macros | TypeScript strict; CI blocks merge on type error |
| L-02 | Sheet addressed by display name; runtime error 9 | Storage behind `RideStore` port; no string-addressed containers |
| L-03 | Two divergent submit handlers; one silently drops `Route` | One domain path; integration test asserts every field round-trips |
| L-04 | `lastRow + 1` overwrites under concurrency | `rowVersion` optimistic concurrency; two-concurrent-bookings test must fail before the control exists |
| L-05 | Origin-only unanchored substring search, no index | Corridor matching over the seeded zone graph, ordered `zoneSequence`, debounced in-memory index |
| L-06 | No error handling; failures invisible | No swallowed conflicts; "that seat just went" surfaced to the user |
| D-01 | 6 time formats, one impossible | ISO 8601 `+06:00`; time wheel, never a text field |
| D-02 | Dates ambiguous between `dd/mm` and `mm/dd` | ISO 8601 with explicit offset; never locale-dependent text |
| D-03 | `"plenty"` in a seat count | Stepper control; integer at the domain boundary |
| D-04 | Free-text locations, 4 spellings of one place by one user | Seeded `Zone` table with aliases; **no free-text locations anywhere** |
| D-05 | `Contact number` empty in 20/20 rows | Directory-sourced `User`; phone masked, revealed only after confirmation, access audit-logged |
| D-06 | Phone number in a display name field | Structured `User.phone`; DPIA finding **DP-01** |
| D-07 | 45% of postings are re-entries of a known route | `CommuteProfile` — the recurring commute is the default path |
| D-08 | No booking mechanism; no ride provably happened | `Booking` entity; completed-trips is the primary success metric |
| D-09 | No cost field | `domain/pricing` with a hard, un-overridable cap |
| D-10 | No row identity; rows addressed by position | Stable `id` on every entity; `AuditLog` on every mutation |
| A-01 | Reachable only via desktop Excel, behind a macro warning | Teams tab, same session, zero install, zero login |
| A-02 | Required the user to remember to open it | Notification-first; every core loop completable from a notification |

---

## 7. Reproducing this audit

```bash
pip install oletools openpyxl
python3 tools/audit_legacy.py legacy/Ride_sharing_platformFinal29012024.xlsm
python3 tools/liquidity_baseline.py
```

Outputs, all git-ignored and regenerable:

| Path | Contents |
|---|---|
| `out/vba/*` | Every VBA module, verbatim |
| `out/sheets/*.csv` | Every sheet, cells as stored, no coercion |
| `out/audit_rows.json` | Per-row fields, defects, disposition, rationale |
| `out/audit_summary.json` | Column mapping, defect tallies, 25 VBA findings |
| `out/liquidity.json` | The diagnostic in [`LIQUIDITY_BASELINE.md`](LIQUIDITY_BASELINE.md) |

The workbook is opened read-only and never written to. It is evidence.
