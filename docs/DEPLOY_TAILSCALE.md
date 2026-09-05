# Running Ekpothe on a machine you control

This gets a public HTTPS address, on the free tier, with no card and no domain,
in about twenty minutes. It is what to do when paying is not an option yet.

**What you are trading.** The app is only up while that machine is on and
connected. Everything else — real disk, real HTTPS, notifications, the timer
that closes out trips — works exactly as it would on a paid host, because it is
the same code with nothing removed. When you are ready to move it off your
machine, nothing colleagues see has to change.

**Why not a free cloud tier.** Free web services on Render and similar cannot
attach a persistent disk. This app keeps everything in one SQLite file, so on
one of those every restart — and they restart constantly — would take the whole
pilot with it. A free tier that silently deletes your data is worse than no
free tier at all. Moving off SQLite is what makes those hosts usable; see the
note at the end.

---

## 1. The machine

Anything that stays on and connected: an office PC, a spare laptop that stays
plugged in, a home desktop. Linux, macOS and Windows all work.

It needs **Node 22 or newer**. Not a preference — the app stores everything
through `node:sqlite`, which is built into Node from 22, which is why there is
no database driver to install and nothing to compile.

```sh
node --version      # must be v22 or higher
```

If it is older, install Node 22 from nodejs.org, or use nvm:
`nvm install 22 && nvm use 22`.

## 2. Get the app onto it

```sh
git clone https://github.com/ruman12-code/Ride-sharing-platform-internal.git
cd Ride-sharing-platform-internal
git checkout claude/legacy-carpool-audit-dvd49k
npm install
```

## 3. Tailscale, and the public address

Tailscale Funnel puts a real HTTPS address in front of a port on this machine.
No card, no domain, and the address is stable — which matters, because it is
baked into every sign-in link you email.

```sh
# Install: see tailscale.com/download for your OS
curl -fsSL https://tailscale.com/install.sh | sh    # Linux
tailscale up                                        # log in, free plan is fine

tailscale status --json | grep -i dnsname           # your address
```

You will get something like `desktop-ruman.tail1234.ts.net`. Write it down —
that, with `https://` in front, is your `APP_URL`.

## 4. Configuration

```sh
cp .env.example .env.local
```

Open `.env.local` and fill in:

- `APP_URL` — `https://` plus the name from step 3
- the five `SMTP_*` values from `EMAIL_SETUP.md`
- `ADMIN_EMAIL` — your personal address
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — run `npm run setup` if you have
  none. **Do not regenerate them later**: every phone already subscribed is tied
  to the old key and would go quiet without any error.

Then prove it works, before anything else:

```sh
npm run preflight -- ruman12@gmail.com
```

This opens a real SMTP connection and sends a real message. Check **which
folder it lands in**. If it is spam, mark it "not spam", and say so in your
invitation — a link nobody can find is a link nobody can use.

Do not continue until this passes. The sign-in form deliberately says "a link is
on its way" whether or not it arrived, so a broken mailer looks exactly like a
working one from the outside.

## 5. Start it

```sh
npm run serve
```

You want to see `push: on` and `email: relay reachable and accepted the login`.

Then, in a second terminal, publish it:

```sh
tailscale funnel 8080
```

Open your `https://...ts.net` address on your phone, over mobile data rather
than office wifi — that proves it is genuinely reachable from outside.

## 6. Keep it running

`npm run serve` dies when you close the terminal. Pick the one for your OS.

**Linux (systemd)** — survives reboots, restarts on crash:

```sh
sudo tee /etc/systemd/system/ekpothe.service > /dev/null <<'UNIT'
[Unit]
Description=Ekpothe
After=network-online.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/Ride-sharing-platform-internal
ExecStart=/usr/bin/node dist-server/server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

npm run build && npm run build:server        # once, before enabling
sudo systemctl enable --now ekpothe
sudo systemctl status ekpothe
sudo tailscale funnel --bg 8080              # survives reboot too
```

**macOS / Windows** — simplest is `pm2`:

```sh
npm install -g pm2
npm run build && npm run build:server
pm2 start dist-server/server/index.js --name ekpothe
pm2 save
pm2 startup        # prints a command to run, which makes it survive reboots
tailscale funnel --bg 8080
```

Also turn off sleep. A laptop that suspends is a server that is down:
macOS System Settings → Battery → prevent sleeping when plugged in; Windows
Settings → Power → Screen and sleep → Sleep: Never.

## 7. Backups

The whole pilot is one file. Do this before you invite anybody.

```sh
cp carpool.db "backup-$(date +%F).db"
```

Weekly, and keep one copy somewhere that is not this machine. It is not
elegant, and it is the difference between an afternoon's annoyance and starting
the pilot again.

## Moving off this machine later

Two things have to change together, and neither is visible to colleagues:

1. **The database.** SQLite in a file is why this needs a real disk. Turso is
   free, needs no card, and is libSQL — a fork of SQLite — so the queries move
   nearly unchanged. The work is that its client is asynchronous where Node's
   built-in SQLite is synchronous: 61 call sites and about 30 methods, with the
   test suite as the safety net. The care goes into the seat-claiming
   compare-and-swap, which is what stops two colleagues taking the same seat.
2. **The host.** `Dockerfile` and `fly.toml` are already in this repo and
   describe a working deployment. Once the database is remote, any free
   always-on host will do.

Keep `APP_URL` pointing at the new address when you move, and re-run the
preflight. Colleagues who are already signed in stay signed in — sessions last
ninety days and roll forward on every visit.
