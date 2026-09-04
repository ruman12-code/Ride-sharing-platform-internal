# Install and run — Ekpothe (একপথে)

Three ways to use this, depending on what you are trying to do. Start at the top.

| I want to… | Go to |
|---|---|
| See it working on my own machine, today | [1. Run it locally](#1-run-it-locally) |
| **Run a real pilot with colleagues** | [2. Run the pilot server](#2-run-the-pilot-server) |
| Deploy it properly into Teams | [3. Deploy to Microsoft 365](#3-deploy-to-microsoft-365) — **not built yet** |

> **Which one do you want?** Section 1 runs the browser app on its own: nothing
> is saved, so it is for looking at, not for using. Section 2 adds the pilot
> server, which stores data in a file and lets colleagues actually share rides
> with each other. Section 3 is the organisational deployment and does not exist
> yet.

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

## 2. Run the pilot server

This is the one that lets colleagues actually use it together. Data persists,
rides are shared, and it needs no SharePoint and no IT involvement.

```bash
npm install
npm start            # builds the app, builds the server, runs it on :8080
```

Or explicitly:

```bash
npm run build && npm run build:server
ALLOWED_EMAIL_DOMAINS=yourcompany.org ADMIN_EMAIL=you@yourcompany.org \
  node dist-server/server/index.js
```

One Node process, one SQLite file, no runtime dependencies. Host it anywhere
that runs Node and gives you a URL — a small VPS, Render, Railway, Fly.io, or a
machine on the office network.

**TLS is enforced, not advised.** Without it the server binds to `127.0.0.1`
only and tells you what to set. The simplest route is Caddy in front:

```bash
# Caddyfile — see server/Caddyfile.example
carpool.example.org {
	reverse_proxy localhost:8080
}
```

```bash
TRUST_PROXY=1 ALLOWED_EMAIL_DOMAINS=yourcompany.org ADMIN_EMAIL=you@yourcompany.org npm start
```

**Access is gated in three steps**, so the URL can be public while the app is
not: a work email domain, an administrator approving the name, and a single-use
code issued to that one colleague. On a fresh database the server prints a
one-time admin code for `ADMIN_EMAIL` — use it once to sign in.

Full detail, including what to say to a colleague who asks about their data, is
in [`HOSTING.md`](HOSTING.md) and [`DATA_SECURITY.md`](DATA_SECURITY.md).

Full detail, including the API and backups, in
[`server/README.md`](../server/README.md).

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
