# Liquidity baseline — the "before" measurement

**Question.** How many legacy postings had another posting on an overlapping
corridor, within ±30 minutes, on the same date?

**Answer.**

| Population | Postings | Matched pairs | Matched postings |
|---|---:|---:|---:|
| All analysable | 15 | 1 | 2 (13.3%) |
| **Real colleagues only** | **9** | **0** | **0 (0%)** |

Produced by `tools/liquidity_baseline.py`; full output in `out/liquidity.json`.

---

## The single "match" is between two test entries

```
rows [6, 8]  2023-08-31  07:00 / 06:30
shared zones: Banani, Gulshan-1
users: "Mr. T" and "Dwaine Bravo (01722334455)"     <-- both fictional
```

Mr. T is an A-Team character; Dwaine Bravo is a West Indies cricketer. Excluding
fictional personas, **the legacy tool produced zero corridor matches in five
months.**

That is the number to beat. It is also, on its own, almost meaningless — and
saying so is the point of this document.

---

## Why this baseline cannot be "improved on" in any statistical sense

A match requires two postings to coincide on **date**, **corridor**, and a
**30-minute window**. The file gives us:

| | |
|---|---:|
| Postings analysed | 15 |
| Distinct dates | 12 |
| Same-date pairs, any corridor | 4 |
| Expected same-date pairs if uniformly spread | 8.75 |
| Postings per working day | 0.185 |

With 15 postings scattered over 12 dates across a five-month window, **the study
had almost no power to detect a match even if latent demand were high.** Four
same-date pairs existed in total; of those four, one shared a corridor. A result
of "0 or 1" was the overwhelmingly likely outcome under *any* demand hypothesis,
including a very optimistic one.

So the correct reading is not *"there was no demand."* It is:

> **The legacy tool never reached the density at which a match was arithmetically
> possible, so it produced no evidence about demand either way.**

This is the load-bearing caveat for the whole project. Both competing
explanations for the failure — *nobody could reach the tool* (the brief's
diagnosis) and *nobody wanted it* — predict exactly the artefact we hold. **The
file cannot distinguish them.** The brief's opening claim, "It did not fail for
lack of demand," is an assumption, not a finding, and should be carried forward
as one.

That is not an argument against building. Removing friction is correct under
either hypothesis, and the friction defects in
[`LEGACY_AUDIT.md`](LEGACY_AUDIT.md) are real and severe. It is an argument
against treating "beat 0 matches" as evidence of success, and against sizing the
build as if demand were established.

---

## Exclusions

From 20 workbook rows to 15 analysable:

| Excluded | Rows | Why |
|---|---:|---|
| Fictional geography | 3 | Krypton→Earth, Neptune→Venus, Marvel→DC Studio cannot share a corridor with Uttara |
| Unresolvable to ≥2 zones | 2 | Free text that maps to no seeded zone, or a blank destination |
| **Analysed** | **15** | |
| *of which fictional personas* | *6* | *reported separately, not dropped* |
| **Real colleagues** | **9** | |

Two dates in the analysed set are locale-transposed (`2023-04-09`, `2023-01-10`
— see `LEGACY_AUDIT.md` §4). Both belong to single-poster recurring runs with no
same-day counterpart, so correcting them does not create a match. The result is
robust to that repair.

---

## What replaces this as the success metric

A baseline of zero cannot be improved on measurably — any positive number is an
infinite improvement and none of them are significant at this n. Four metrics
that can actually be read at an organisation of under 150 people:

| Metric | Legacy | Why it is readable |
|---|---|---|
| **Completed trips** | **Unknowable — the tool had no booking mechanism and column G was empty in every row** | A counted event, unambiguous at n=1 |
| Postings per working day | **0.185** | Direct, comparable, no inference needed |
| Share of postings from a `CommuteProfile` | 0 (no such concept) | Tests the central product bet directly |
| Notification click-through by type | 0 (no notifications) | Tests the access-path diagnosis directly |

**Completed trips is the primary metric.** The legacy tool could not establish
that a single ride ever happened. One provable completed trip is a categorical
improvement over an unmeasurable zero, and it is the only number here that
survives the small-sample problem.

The two diagnostic metrics matter more than the volume ones. If notification
click-through is high and postings still do not convert, the access-path
diagnosis was right and the constraint is liquidity. If click-through is low, the
tool is still not reaching people and the redesign has not done its job. Either
way we learn something the legacy file could not tell us — which is the real
deliverable of instrumenting v1.

## Zero-result searches are the demand map

Every zero-result search is logged with its full parameters, and every "Alert me"
creates a standing demand record. At this headcount those logs will be a better
demand signal than the posting count, because they capture intent that never
found supply — exactly the quantity the legacy file is missing and the reason it
can tell us nothing.
