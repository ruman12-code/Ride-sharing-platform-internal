# Ekpothe — standalone pilot server

Runs the app without SharePoint, so you can put it in front of colleagues now
and decide later whether it is worth pitching to management.

One Node process, one SQLite file, **no runtime dependencies**. Node 22's
built-in `node:sqlite` does the storage.

## Running it

```bash
npm install
npm run build            # the browser app
npm run build:server     # the server
PILOT_PASSPHRASE='pick-something-and-share-it' node dist-server/server/index.js
```

Then open `http://localhost:8080`. Or just `npm start`, which does all three.

| Variable | Default | Notes |
|---|---|---|
| `PILOT_PASSPHRASE` | — | **Required.** The server refuses to start without it |
| `PORT` | `8080` | |
| `DB_PATH` | `./carpool.db` | The whole database. Back it up by copying it |
| `TLS_CERT` / `TLS_KEY` | unset | Certificate and key; this process terminates TLS |
| `TRUST_PROXY` | unset | `1` when Caddy/nginx/a PaaS already terminates TLS |
| `REDIRECT_PORT` | unset | Plain-HTTP port that 301s to HTTPS |
| `DIST_DIR` | `./dist` | Where the built browser app lives |

## TLS — already built, and enforced

**Without TLS the server binds to `127.0.0.1` only** and prints why. It will not
quietly serve an office-wide URL in the clear, because a pilot leaking
passphrases across the network is worse than a pilot nobody can reach: the
second failure is visible and the first is not.

Two supported shapes.

**A. Something in front terminates TLS** — recommended. A two-line Caddyfile is
in [`Caddyfile.example`](Caddyfile.example); Caddy obtains and renews a Let's
Encrypt certificate itself.

```bash
TRUST_PROXY=1 PILOT_PASSPHRASE='...' npm start
```

**B. This process terminates TLS.**

```bash
TLS_CERT=/etc/letsencrypt/live/you/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/you/privkey.pem \
REDIRECT_PORT=80 \
PILOT_PASSPHRASE='...' npm start
```

`REDIRECT_PORT` runs a plain-HTTP listener that 301s to HTTPS — worth setting,
because colleagues will type the bare hostname and a connection refused reads as
"the tool is broken".

With TLS in either shape the server sends HSTS, marks the session cookie
`Secure`, and binds to the network. Without it, HSTS is deliberately **not**
sent: promising a browser this origin is always HTTPS and then serving it over
HTTP in development locks you out of your own machine.

Every response also carries `X-Content-Type-Options: nosniff`,
`Referrer-Policy: same-origin` and `X-Frame-Options: DENY`, from one place, so a
handler added later cannot quietly omit them.

## Where to put it

Anything that runs Node and gives you a URL: a small VPS, Render, Railway,
Fly.io, or a machine inside the office network. One process, one file.

## What the pilot's sign-in actually is — read this

A shared passphrase plus your name and email. **That is not identity.** It proves
somebody knows the passphrase; it does not prove who they are. Anyone with the
passphrase can sign in as any name and any email.

This is a deliberate trade for a voluntary trial among colleagues who already
know each other, and it has consequences that are designed around rather than
ignored:

- **Contact details are exchanged, never listed.** A colleague's number is
  released only once a driver has *accepted* a specific rider — both ways, so
  each can say "I'm at the gate" and "two minutes away". It appears in no
  listing, no search and no export, and every release is written to the audit
  log. The driver holds the gate: a request they decline discloses nothing, and
  declining is silent.

  This is the difference that matters under a shared passphrase. A browsable
  directory of numbers would be harvestable by anyone who knew the passphrase —
  the legacy workbook's worst privacy defect rebuilt as a feature. An exchange
  cannot be harvested without a named driver agreeing, one rider at a time.
- **Do not use it for anything you would mind a colleague reading.**
- **Change the passphrase when someone leaves**, and tell people you did.
- Treat every posting as informal. This is a trial of whether the idea works,
  not a system of record.

Say all of that to colleagues when you invite them. People who find out later
that a "secure" tool was not stop trusting the next one you build.

Real deployment replaces this entirely with Entra ID, at which point sign-in
becomes the Teams session they already have and none of the above applies.

## What it does enforce properly

The rules are not relaxed for the pilot. Every write goes through the same pure
domain functions the browser uses, so a hand-written HTTP request cannot talk it
into a state the rules forbid:

- **Seat races.** Claiming a seat is a conditional `UPDATE ... WHERE rowVersion = ?`.
  Two colleagues going for the last seat: one gets `201`, the other gets `409
  That seat just went.` Never both.
- **Idempotency** is a `UNIQUE (riderId, idempotencyKey)` constraint, so a
  double-tap on a slow connection is a no-op in the database, not just in the app.
- **Seat counts** are recomputed from bookings on the server and never taken
  from the request.
- **The cost-share cap**, the daily ride cap, no self-booking, no departures in
  the past, one ride per rider per day.
- **The ledger** has `UNIQUE (bookingId)`, so completing a trip twice cannot
  double the credit.
- Every mutation writes an audit row.

## API

All JSON, session cookie `cp`.

| Method | Path | |
|---|---|---|
| `POST` | `/api/sign-in` | `{email, displayName, passphrase}` → sets the cookie |
| `GET` | `/api/me` | Current session, or `401` |
| `GET` | `/api/rides` | Published and full rides |
| `POST` | `/api/rides` | Publish. `400` if a domain rule rejects it |
| `GET` | `/api/bookings` | Your bookings |
| `POST` | `/api/bookings` | Request a seat. `409` on a lost race |
| `POST` | `/api/complete` | Mark a trip completed, write the ledger entry |
| `POST` | `/api/zero-result` | Log a search that found nothing |

## Backups

```bash
cp carpool.db carpool-$(date +%F).db
```

Do it before every deploy. It is a single file and there is no excuse not to.

## Moving to SharePoint later

Nothing here is a dead end. The browser app talks to ports, not to this server.
Swapping `adapters/sharepoint/` in place of these handlers changes no business
logic and no interface — that separation is the whole reason the domain layer
has no I/O in it. This directory is one implementation of the ports; SharePoint
will be another.
