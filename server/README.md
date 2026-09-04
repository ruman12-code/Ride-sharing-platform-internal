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
ALLOWED_EMAIL_DOMAINS=yourcompany.org ADMIN_EMAIL=you@yourcompany.org \
  node dist-server/server/index.js
```

Then open `http://localhost:8080`. Or just `npm start`, which does all three.

| Variable | Default | Notes |
|---|---|---|
| `ALLOWED_EMAIL_DOMAINS` | — | **Required.** Work domains that may request access |
| `ADMIN_EMAIL` | — | **Required.** The first administrator |
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
TRUST_PROXY=1 ALLOWED_EMAIL_DOMAINS=yourcompany.org ADMIN_EMAIL=you@... npm start
```

**B. This process terminates TLS.**

```bash
TLS_CERT=/etc/letsencrypt/live/you/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/you/privkey.pem \
REDIRECT_PORT=80 \
ALLOWED_EMAIL_DOMAINS=yourcompany.org ADMIN_EMAIL=you@... npm start
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

## Who can get in

Three gates. A stranger who finds the URL gets past none of them.

1. **Email domain.** Only addresses on `ALLOWED_EMAIL_DOMAINS` may request
   access. A personal Gmail address is refused at the form, with the reason
   shown so nobody waits for an approval that will never come.
2. **A person approves.** The request creates a *pending* user that can do
   nothing. An administrator who recognises the name approves it.
3. **A single-use code.** Approval issues a six-character code bound to that one
   email, consumed on first use and expiring in seven days. Forwarding it does
   not work.

The third gate is what a shared passphrase could not give you: a passphrase
proves somebody knows a secret; a code issued to one address and usable once
proves it is that colleague.

Codes are stored as scrypt hashes, so a copy of the database hands nobody a
working code. Suspending someone deletes their live sessions immediately, and
status is re-checked on every request rather than only at sign-in.

### Required environment

```bash
ALLOWED_EMAIL_DOMAINS=yourcompany.org   # comma-separated for more than one
ADMIN_EMAIL=you@yourcompany.org         # the first administrator
```

The server **refuses to start** without either. A permissive default on the
first would put a stranger inside the app with nobody noticing; without the
second there would be no one to approve the first request.

On a fresh database the server prints a one-time **admin code** for
`ADMIN_EMAIL`. Use it once to sign in. It is not stored and is not shown again.

### The honest limitation

Anyone who obtains a colleague's code *before they use it* could sign in as
them. That is why codes are sent privately, expire in seven days, and die on
first use. It is a real risk, smaller than it sounds, and not zero — say so when
you invite people.

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
| `POST` | `/api/request-access` | `{email, displayName}` → pending. Open |
| `POST` | `/api/sign-in` | `{email, code}` → sets the cookie. Open |
| `GET` | `/api/admin/pending` | Requests awaiting approval. Admin only |
| `POST` | `/api/admin/approve` | `{userId}` → returns the code, once. Admin only |
| `POST` | `/api/admin/suspend` | `{userId}`. Admin only |
| `PUT` | `/api/contact` | Set your own contact detail |
| `POST` | `/api/contact` | `{bookingId}` → a counterparty's detail, if allowed |
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
