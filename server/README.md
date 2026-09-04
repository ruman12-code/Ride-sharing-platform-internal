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
| `HTTPS` | unset | Set to `1` behind TLS so the session cookie is marked Secure |

## Where to put it

Anything that runs Node and gives you a URL: a small VPS, Render, Railway,
Fly.io, or a machine inside the office network. It is one process and one file.

**Put it behind HTTPS.** Passphrases and session cookies over plain HTTP on an
office network are readable by anyone on that network. A free certificate takes
ten minutes and there is no good reason to skip it.

## What the pilot's sign-in actually is — read this

A shared passphrase plus your name and email. **That is not identity.** It proves
somebody knows the passphrase; it does not prove who they are. Anyone with the
passphrase can sign in as any name and any email.

This is a deliberate trade for a voluntary trial among colleagues who already
know each other, and it has consequences that are designed around rather than
ignored:

- **The pilot holds no phone numbers.** The `phone` column exists and stays
  empty. Contact details behind an unverified sign-in would be the legacy
  workbook's privacy defect rebuilt on purpose.
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
