#!/usr/bin/env python3
"""
Liquidity diagnostic over the migrated legacy postings.

Question: how many legacy postings had another posting on an overlapping
corridor, within +/-30 minutes, on the same date?

This is the "before" measurement the new application has to beat. It is NOT
evidence about latent demand, and this script deliberately reports the
statistical power of the result alongside the result itself, because a count of
zero drawn from twenty postings means "we could not have detected a match even
if demand existed", not "there is no demand".

Reads  out/audit_rows.json  (produced by tools/audit_legacy.py)
Writes out/liquidity.json
"""

from __future__ import annotations

import datetime as dt
import itertools
import json
import re
from pathlib import Path

OUT = Path("out")

# ---------------------------------------------------------------------------
# Zone normalisation
#
# Every alias below is a spelling that actually occurs in the legacy file. The
# canonical names match the seed zone table the application ships with, so this
# map is the migration's location-resolution layer and doubles as the initial
# `aliases[]` content for the Zone entity.
# ---------------------------------------------------------------------------

ALIASES = {
    "uttara": "Uttara", "khilkhet": "Khilkhet", "300 feet": "300 Feet",
    "300 feets": "300 Feet", "express road (300 feet)": "300 Feet",
    "jamuna": "Jamuna Future Park", "jamuna 300 feet": "Jamuna Future Park",
    "jamuna futur park": "Jamuna Future Park",
    "jumuna future park express road (300 feet)": "Jamuna Future Park",
    "jamuna future park": "Jamuna Future Park",
    "notun bazar": "Notun Bazar", "notun baza": "Notun Bazar",
    "bishow road": "Bishwa Road", "bashundhara": "Bashundhara R/A",
    "empori": "Gulshan-2", "emporia": "Gulshan-2",
    "gulshan empori financial tower": "Gulshan-2",
    "empori, tc": "Gulshan-2", "empori tc": "Gulshan-2",
    "giz tc office": "Gulshan-2", "giz tc office gulshan": "Gulshan-2",
    "gulshan circle 2": "Gulshan-2", "gulshan cirle-2": "Gulshan-2",
    "gulshan-2": "Gulshan-2", "gulshan rd 123": "Gulshan-2",
    "gulshan": "Gulshan-1", "gulshan-1": "Gulshan-1",
    "banani": "Banani", "mohakhali": "Mohakhali", "bijoy sarani": "Bijoy Sarani",
    "agargaon": "Agargaon", "shamoli": "Shyamoli", "shyamoli": "Shyamoli",
    "sobhanbagh": "Dhanmondi", "dhanmondi": "Dhanmondi", "lalmatia": "Lalmatia",
    "mohammadpur": "Mohammadpur", "mirpur": "Mirpur-10", "kalshi": "Kalshi",
    "gazipur": "Gazipur", "shodorghat": "Sadarghat", "sadarghat": "Sadarghat",
    "dmcc": "Motijheel", "chattogram": "Chattogram", "dhaka": "Dhaka",
}

# Postings whose geography is fictional. Excluded from the diagnostic because a
# trip from Krypton cannot share a corridor with a trip from Uttara, and leaving
# them in would inflate the denominator while contributing no possible match.
FICTIONAL = {
    "marvel studio", "dc studio", "fox studio", "crypton", "earth",
    "neptune", "venus", "solar system jupter- saturn etc.",
    "uranus-jupiter-saturn-mars-earth-moon-venus",
}


def canon(text: str | None) -> list[str]:
    """Resolve a free-text location cell to canonical zone names, in order."""
    if not text:
        return []
    low = text.strip().lower()
    if low in FICTIONAL:
        return ["__FICTIONAL__"]
    # Split on the separators actually used in the file: / - to via ,
    parts = re.split(r"\s*(?:/|-|,| to | via )\s*", low)
    zones: list[str] = []
    for p in parts:
        p = p.strip(" .")
        if not p:
            continue
        if p in ALIASES:
            z = ALIASES[p]
        else:
            # Longest alias contained in the fragment wins, so "khilkhet via
            # notun bazar 300 feet" yields all three rather than none.
            hits = sorted(
                (a for a in ALIASES if a in p), key=len, reverse=True
            )
            z = ALIASES[hits[0]] if hits else None
        if z and (not zones or zones[-1] != z):
            zones.append(z)
    return zones


def parse_time(v: str | None) -> dt.time | None:
    """Parse the six inconsistent time formats present in the file."""
    if not v:
        return None
    s = str(v).strip().lower().replace(".", ":")
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$", s)
    if not m:
        return None
    hh = int(m.group(1))
    mm = int(m.group(2) or 0)
    if mm > 59 or hh > 23:
        return None
    mer = m.group(3)
    if mer == "pm" and hh < 12:
        hh += 12
    elif mer == "am" and hh == 12:
        hh = 0
    if hh > 23:
        return None
    return dt.time(hh, mm)


def parse_date(v: str | None) -> tuple[dt.date | None, bool]:
    """Return (date, ambiguous).

    `ambiguous` is True when the value cannot be placed on the calendar with
    confidence: text dd/mm/yyyy read under an unknown locale, or an Excel date
    serial that falls outside the campaign window and is therefore likely a
    day/month transposition made at entry time.
    """
    if not v:
        return None, False
    s = str(v).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y += 2000 if y < 100 else 0
        # Bangladesh writes dd/mm/yyyy; Excel may have read it as mm/dd.
        try:
            return dt.date(y, mo, d), (d <= 12)
        except ValueError:
            return None, True
    try:
        parsed = dt.datetime.fromisoformat(s).date()
    except ValueError:
        return None, True
    return parsed, False


def main() -> int:
    rows = json.loads((OUT / "audit_rows.json").read_text())

    postings = []
    excluded = {"fictional_geography": 0, "no_date": 0, "no_time": 0, "no_zones": 0}
    campaign_dates = []

    for r in rows:
        f = r["fields"]
        origin = canon(f.get("origin"))
        dest = canon(f.get("destination"))
        via = canon(f.get("via"))

        if "__FICTIONAL__" in origin + dest + via:
            excluded["fictional_geography"] += 1
            continue

        date, ambiguous = parse_date(f.get("date"))
        time = parse_time(f.get("time"))
        if date is None:
            excluded["no_date"] += 1
            continue
        if time is None:
            excluded["no_time"] += 1
            continue

        seq = origin + via + dest
        deduped: list[str] = []
        for z in seq:
            if not deduped or deduped[-1] != z:
                deduped.append(z)
        if len(deduped) < 2:
            excluded["no_zones"] += 1
            continue

        campaign_dates.append(date)
        postings.append({
            "row": r["row"], "user": (f.get("user") or "").strip(),
            "date": date.isoformat(), "time": time.isoformat(),
            "zone_sequence": deduped, "date_ambiguous": ambiguous,
            "fictional_persona": "FICTIONAL_PERSONA" in r["defects"],
            "raw": {"origin": f.get("origin"), "destination": f.get("destination"),
                    "via": f.get("via")},
        })

    # --- the diagnostic -----------------------------------------------------
    def minutes(t: str) -> int:
        h, m = t.split(":")[:2]
        return int(h) * 60 + int(m)

    def diagnose(pool):
        pairs = []
        for a, b in itertools.combinations(pool, 2):
            if a["date"] != b["date"]:
                continue
            if abs(minutes(a["time"]) - minutes(b["time"])) > 30:
                continue
            shared = set(a["zone_sequence"]) & set(b["zone_sequence"])
            if len(shared) < 2:
                continue
            pairs.append({
                "rows": [a["row"], b["row"]], "date": a["date"],
                "times": [a["time"], b["time"]], "shared_zones": sorted(shared),
                "users": [a["user"], b["user"]],
                "both_fictional": a["fictional_persona"] and b["fictional_persona"],
            })
        return pairs

    real_only = [p for p in postings if not p["fictional_persona"]]
    pairs_all = diagnose(postings)
    pairs_real = diagnose(real_only)

    matched_pairs = []
    for a, b in itertools.combinations(postings, 2):
        if a["date"] != b["date"]:
            continue
        if abs(minutes(a["time"]) - minutes(b["time"])) > 30:
            continue
        shared = set(a["zone_sequence"]) & set(b["zone_sequence"])
        if len(shared) < 2:
            continue
        matched_pairs.append({
            "rows": [a["row"], b["row"]], "date": a["date"],
            "times": [a["time"], b["time"]], "shared_zones": sorted(shared),
            "users": [a["user"], b["user"]],
        })

    matched_rows = {r for p in matched_pairs for r in p["rows"]}

    # --- statistical power --------------------------------------------------
    # With n postings spread over d distinct dates, the expected number of
    # same-date pairs under a uniform spread is roughly C(n,2)/d. If that is
    # below ~1, the study cannot detect a match even where demand exists, and
    # the resulting zero says nothing about the market.
    distinct_dates = len({p["date"] for p in postings})
    n = len(postings)
    same_date_pairs = sum(
        1 for a, b in itertools.combinations(postings, 2) if a["date"] == b["date"]
    )
    expected_pairs = (n * (n - 1) / 2) / distinct_dates if distinct_dates else 0

    result = {
        "HEADLINE": {
            "all_analysable_postings": {
                "postings": n, "matched_pairs": len(pairs_all),
                "matched_postings": len({r for p in pairs_all for r in p["rows"]}),
            },
            "real_colleagues_only": {
                "postings": len(real_only), "matched_pairs": len(pairs_real),
                "matched_postings": len({r for p in pairs_real for r in p["rows"]}),
            },
        },
        "pairs_real_colleagues_only": pairs_real,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_rows_in_workbook": len(rows),
        "excluded": excluded,
        "postings_analysed": n,
        "distinct_dates": distinct_dates,
        "campaign_window": {
            "first": min(campaign_dates).isoformat() if campaign_dates else None,
            "last": max(campaign_dates).isoformat() if campaign_dates else None,
        },
        "date_ambiguous_count": sum(1 for p in postings if p["date_ambiguous"]),
        "same_date_pairs_any_corridor": same_date_pairs,
        "expected_same_date_pairs_if_uniform": round(expected_pairs, 3),
        "MATCHED_PAIRS": len(matched_pairs),
        "MATCHED_POSTINGS": len(matched_rows),
        "match_rate": round(len(matched_rows) / n, 4) if n else 0.0,
        "pairs": matched_pairs,
        "postings": postings,
    }

    (OUT / "liquidity.json").write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"postings analysed            : {n} (from {len(rows)} workbook rows)")
    print(f"  excluded                   : {excluded}")
    print(f"campaign window              : {result['campaign_window']['first']}"
          f" .. {result['campaign_window']['last']}")
    print(f"distinct dates               : {distinct_dates}")
    print(f"same-date pairs (any route)  : {same_date_pairs}")
    print(f"expected if uniform          : {expected_pairs:.2f}")
    print(f"MATCHED PAIRS (corridor+/-30m): {len(matched_pairs)}")
    print(f"MATCHED POSTINGS             : {len(matched_rows)}  "
          f"({result['match_rate']*100:.1f}% of analysed)")
    for p in pairs_all:
        flag = "  <-- BOTH FICTIONAL" if p["both_fictional"] else ""
        print(f"   rows {p['rows']} {p['date']} {p['times']} "
              f"shared={p['shared_zones']} users={p['users']}{flag}")
    print()
    print("=" * 62)
    print(f"BASELINE, all analysable postings   : {len(pairs_all)} pair(s), "
          f"{len({r for q in pairs_all for r in q['rows']})} of {n} postings")
    print(f"BASELINE, real colleagues only      : {len(pairs_real)} pair(s), "
          f"{len({r for q in pairs_real for r in q['rows']})} of {len(real_only)} postings")
    print("=" * 62)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
