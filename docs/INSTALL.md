# Install and run

Three ways to use this, depending on what you are trying to do. Start at the top.

| I want to… | Go to |
|---|---|
| See it working on my own machine, today | [1. Run it locally](#1-run-it-locally) |
| Put it in front of colleagues to try | [2. Share a pilot build](#2-share-a-pilot-build) |
| Deploy it properly into Teams | [3. Deploy to Microsoft 365](#3-deploy-to-microsoft-365) — **not built yet** |

> **Read this first.** What exists today runs entirely in the browser against
> in-memory demo data. **Nothing is saved.** Refresh the page and every ride and
> booking is gone. That is deliberate — the SharePoint adapter that makes data
> persist is step 7 and is not written yet — but it means sections 1 and 2 are
> for *evaluating* the app, not for running a real carpool.

---

## 1. Run it locally

### What you need

| | Version | Check with | If missing |
|---|---|---|---|
| Node.js | 20.19+ or 22.12+ | `node --version` | [nodejs.org](https://nodejs.org) — take the LTS |
| npm | comes with Node | `npm --version` | — |
| Git | any recent | `git --version` | [git-scm.com](https://git-scm.com) |

Windows, macOS and Linux all work. No database, no server, no API keys.

### Steps

```bash
git clone https://github.com/ruman12-code/Ride-sharing-platform-internal.git
cd Ride-sharing-platform-internal
git checkout claude/legacy-carpool-audit-dvd49k
npm install          # about a minute
npm run dev
```

Open **http://localhost:5173**. That is it.

### Making it look right

It is designed for a phone. In a desktop browser press **F12**, click the
phone/tablet icon (or `Ctrl+Shift+M` / `Cmd+Shift+M`), and pick a device about
360px wide. Everything is designed at that width first.

### If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `command not found: npm` | Node not installed or not on PATH | Install Node, open a new terminal |
| `EADDRINUSE` on 5173 | Something else has the port | `npm run dev -- --port 5174` |
| Blank white page | Stale build cache | `rm -rf node_modules/.vite && npm run dev` |
| Bangla shows as boxes | Font blocked or offline | Cosmetic only. Install *Noto Sans Bengali* locally |
| `npm install` fails behind a proxy | Corporate proxy | `npm config set proxy http://your-proxy:port` |

---

## 2. Share a pilot build

To let colleagues click through it without installing anything.

```bash
npm run build        # writes dist/
npm run preview      # serves it at http://localhost:4173
```

`dist/` is plain static files. Drop it on any static host, an internal web
server, or a SharePoint document library set to serve HTML.

**Before you share it, say this to whoever tries it:**

> This is a preview. Nothing you enter is saved — refresh and it is gone. The
> people, rides and prices in it are made up. Do not enter a real phone number.

That warning is not politeness. Colleagues who enter real details into a demo
and then find them gone will not trust the real thing when it arrives.

---

## 3. Deploy to Microsoft 365

**This does not work yet, and it is the honest gap in the project.**

The architecture is decided ([ADR-001](ADR-001-architecture.md)) and the domain
core is finished and tested, but the SharePoint adapter, the Teams tab manifest
and the Power Automate notification flows are step 7 of the build order and are
not written. When they are, this section covers:

1. Provision the SharePoint lists (Rides, Bookings, CommuteProfiles, Zones,
   FuelPrices, Ledger, Incidents, AuditLog, Consents).
2. Register the Entra ID application and grant the Graph scopes.
3. Package the SPFx web part and upload to the tenant app catalogue.
4. Add it as a Teams tab.
5. Import the Power Automate flows for the notification loop.
6. Seed zones and the current fuel price.
7. Assign the first admin.

Until then, sections 1 and 2 are what exist.

---

## Everyday commands

```bash
npm run dev          # development server, hot reload
npm run build        # production build into dist/
npm run preview      # serve the production build
npm test             # 152 unit tests
npm run test:e2e     # 10 browser tests at 360px
npm run typecheck    # TypeScript, strict
```

Run `npm test && npm run typecheck` before committing anything. Both must pass.

## Re-running the legacy audit

```bash
pip install oletools openpyxl
python3 tools/audit_legacy.py legacy/Ride_sharing_platformFinal29012024.xlsm
python3 tools/liquidity_baseline.py
```

Writes to `out/` (git-ignored, regenerable). The workbook is opened read-only.

## Configuration

Nothing is required to run it. Two optional variables, both off by default:

| Variable | Default | What it does |
|---|---|---|
| `VITE_ROUTING_PROVIDER` | `zone-graph` | `google` switches to the Google Directions adapter |
| `VITE_GOOGLE_MAPS_API_KEY` | unset | Required if the above is `google` |

**Do not set these without reading [ADR-002](ADR-002-routing.md) §"Why Google is
built but not enabled".** Turning it on sends colleagues' journey endpoints to a
third party, which needs a lawful basis and a DPIA entry it does not yet have.

Put them in `.env.local`, which is git-ignored. **Never commit an API key.**
