# ADR-002 — Route computation, and the Google Maps question

- **Status:** Accepted, with the Google adapter built but **disabled**
- **Date:** 2026-09-04
- **Amends:** [ADR-001](ADR-001-architecture.md) §"Rejected options" — "No paid map API in Phase 1"

## Context

The sponsor asked for three changes:

> *"Do not include the pre-defined corridors. Let the users select origin and finish
> of the journey. Once selected, an automated route (e.g. Google Maps, based on the
> best route calculation) will be measured and shown."*
>
> *"When searching for a trip, any points within this calculated route could ideally
> be a picking and/or dropping point."*

The first is unambiguously right, and the reasoning is worth recording: a
hand-maintained corridor list means **a journey nobody anticipated cannot be
offered at all.** The three corridors we seeded came from the sponsor and from
20 legacy postings — a sample far too small to define the boundaries of what
colleagues will actually want. Gazipur→Dhanmondi appeared in the legacy file and
fitted no corridor. So did Dhaka→Chattogram.

## Decision

### 1. Corridors are gone

`CORRIDORS`, `Corridor` and `suggestViaZones` are deleted. `Zone.corridorIds` is
retained on the type for reporting but is seeded empty, so nothing can quietly
start depending on a hand-maintained list again.

### 2. Routes are computed between any two zones

A `RoutePlanner` port with two adapters.

**`ZoneGraphPlanner` — the default.** Builds an undirected adjacency graph from
zone coordinates (everything within 5 km, and always at least the 4 nearest so
outlying districts are never stranded), then Dijkstra. Straight-line distance is
scaled by a **1.35 detour factor** to approximate road distance, and duration by
an assumed **12 km/h** Dhaka peak-hour speed.

Both figures are stated assumptions, not measurements, and the interface labels
every distance derived from them "Estimated". The detour factor affects the cost
share; the speed affects only the displayed travel time.

**`GoogleDirectionsPlanner` — built, tested, and off.** Real road geometry and
live-traffic durations. Falls back to the zone graph on any failure, so a quota
exhaustion or outage degrades rather than blocking a colleague from publishing.

### 3. Every zone on a route is a boarding and alighting point

This already fell out of the matching model — a ride is an ordered
`zoneSequence`, and a rider matches when `index(board) < index(alight)`. Now that
the sequence comes from the router rather than a corridor, the property holds for
any journey. Tests enumerate **every ordered pair of stops** on a computed
Uttara→Gulshan route and assert each is bookable, and that the reverse direction
still is not.

## Why Google is built but not enabled

Not caution for its own sake. Three specific costs, and the first is the one
that matters:

**1. Personal data leaves the tenant.** Every Directions call sends a
colleague's journey endpoints to Google. Over a few weeks of commutes that
accumulates into a record of where your staff live and when they leave home.
Under the Personal Data Protection Act 2026 that is a distinct processing
activity needing a lawful basis, a consent scope, and a DPIA entry. **It is not
covered by the consent the app collects at first launch**, and the brief's own
instruction was: *"Send no personal data to any third-party service without
asking me first."* This ADR is that asking.

**2. It is metered.** Directions requests are billed per call. The zone graph
costs nothing and needs no key.

**3. It is a hard dependency.** An outage, a quota exhaustion, or a lapsed
billing account stops colleagues publishing rides — for an organisation of under
150 people, to buy a distance estimate that is already good enough to divide a
fuel bill by three.

### What enabling it requires

All four, deliberately:

1. `VITE_GOOGLE_MAPS_API_KEY` in the environment. **Never committed.**
2. `VITE_ROUTING_PROVIDER=google`.
3. `docs/DPIA.md` updated with the transfer, and the consent scope
   `routing:third-party` added to `ConsentRecord`.
4. The API key restricted by HTTP referrer **and** to the Directions API only.
   An unrestricted key in a browser bundle is a key anyone can spend.

### The accuracy question, honestly

The zone-graph estimate is worse than Google's road distance. How much worse
matters less than it sounds, because of what the number is *for*: dividing a
fuel cost among occupants. A 15% distance error on a 14 km trip moves a Tk 70
seat share by about Tk 10 — and the share is floored to the nearest Tk 10
anyway, so much of that error is rounded away before anyone sees it.

Where Google is genuinely better is **travel time**, because it sees traffic and
we assume a flat 12 km/h. If colleagues complain that arrival estimates are
wrong, that is the signal to revisit this — not the cost share.

## Rejected options

| Option | Why rejected |
|---|---|
| **Google as the default** | Sends journey endpoints to a third party for every colleague, before the DPIA covers it and before the sponsor has weighed the cost. Reversible in one environment variable once they have. |
| **Barikoi** (local Bangladeshi geocoder) | Strong Bangla address coverage and a better privacy story than Google for a Dhaka organisation. Worth evaluating, but it is still a third-party transfer and needs the same DPIA answer, so it does not avoid the decision — only changes who receives the data. |
| **OpenStreetMap / OSRM self-hosted** | Real road geometry with no third-party transfer and no metering. The strongest long-term answer, and the one to reach for if the estimate proves inadequate. Rejected for now only on operational cost: it is a server to run and keep current for an organisation of under 150. |
| **Keeping corridors as a fallback** | Two sources of truth for the same question. The corridor list would rot silently while the router stayed correct. |

## What would reverse this

| Trigger | Response |
|---|---|
| Sponsor authorises the third-party transfer and updates the DPIA | Set the two environment variables. No code change. |
| Colleagues report arrival times are consistently wrong | Enable Google, or calibrate `AVERAGE_SPEED_KMH` from completed-trip data — which the instrumentation already collects, and which costs nothing. |
| Cost shares are disputed as inaccurate | Calibrate `ROAD_DETOUR_FACTOR` against odometer readings from real trips. A driver's measured km/L already overrides the fuel default; distance deserves the same treatment. |
| Google billing lapses or quota exhausts | Already handled: the adapter falls back to the zone graph rather than failing. |
