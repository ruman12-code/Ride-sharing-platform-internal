# Getting Ekpothe on the internet, safely

The complete picture, in plain terms. No prior knowledge of certificates assumed.

---

## What the problem actually is

Your laptop talks to a server by sending data across a chain of equipment you do
not own: the office wifi access point, the office router, your ISP, a few
machines in between.

**Over plain HTTP, every one of those can read what passes through, in full.**
Not "in theory" — anyone on the same office wifi running freely available
software can watch it scroll past. That includes:

- the code a colleague types to sign in
- their session cookie, which *is* their identity — copy it and you are them
- who is driving where, and when

**HTTPS encrypts that.** The equipment in between still moves the data but can no
longer read it. That is the whole of it.

## What a certificate is, and why it is free

For your browser to encrypt traffic to `carpool.yourcompany.org`, it needs to
know it is really talking to your server and not to something pretending to be
it. A **certificate** is a file that proves that, signed by an authority every
browser already trusts.

**Let's Encrypt** issues them free, automatically, in about ten seconds. It
checks you control the domain by asking your server to answer a challenge on it.
They last 90 days and renew themselves. Nobody is involved, and there is nothing
to pay.

If you have heard that certificates are expensive and bureaucratic, that was
true, and it stopped being true around 2016.

---

## What you need before anything else

**One thing: a hostname pointing at your server.**

You cannot get a certificate for a bare IP address. You need something like
`carpool.yourcompany.org` or `ekpothe.xyz`, with a DNS record aimed at the
machine.

Two ways:

| | How | Cost | Notes |
|---|---|---|---|
| **A subdomain of the company domain** | Ask IT for a DNS A record for `carpool.yourcompany.org` → your server's IP | free | Looks official. But it *is* asking IT, which you wanted to avoid at this stage |
| **A domain you buy yourself** | ~US$10–15/year from Namecheap, Porkbun, Cloudflare | ~Tk 1,500/yr | No permission needed. Recommended for the pilot |

**For a pilot, buy your own.** It keeps the whole thing yours to start and stop,
which is the point of piloting before pitching.

---

## Three ways to host it — pick one

### Option 1 — A platform that handles TLS for you *(easiest, recommended)*

Render, Railway and Fly.io run your Node app and give you HTTPS on their domain
straight away, with no certificate work at all. Point your own domain at it later
if you want.

```bash
# Render / Railway: connect the GitHub repo, then set
Build command:  npm install && npm run build && npm run build:server
Start command:  node dist-server/server/index.js
Environment:    TRUST_PROXY=1
                ALLOWED_EMAIL_DOMAINS=yourcompany.org
                ADMIN_EMAIL=you@yourcompany.org
```

`TRUST_PROXY=1` tells Ekpothe that the platform already terminated TLS, so it
marks the session cookie `Secure` and serves to the network.

- **Cost:** free tiers exist; a small paid instance is ~US$5–7/month
- **Effort:** about fifteen minutes
- **Catch:** the free tiers sleep when idle, so the first visit of the morning
  takes a few seconds. Also **your database lives on their disk** — check they
  offer a persistent volume, or `carpool.db` disappears on redeploy

### Option 2 — Your own server, with Caddy in front *(most control)*

A US$5/month VPS from DigitalOcean, Hetzner or Linode. Caddy sits in front and
obtains the certificate itself.

```
# /etc/caddy/Caddyfile — this is the entire configuration
carpool.yourcompany.org {
	reverse_proxy localhost:8080
}
```

```bash
caddy run   # gets a certificate on the first request, renews it forever
TRUST_PROXY=1 ALLOWED_EMAIL_DOMAINS=yourcompany.org ADMIN_EMAIL=you@... npm start
```

- **Cost:** ~US$5/month
- **Effort:** an hour the first time
- **Catch:** the machine is yours to keep patched

### Option 3 — Ekpothe terminates TLS itself *(no proxy)*

Supported, and useful when you already have certificate files.

```bash
TLS_CERT=/etc/letsencrypt/live/you/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/you/privkey.pem \
REDIRECT_PORT=80 \
ALLOWED_EMAIL_DOMAINS=yourcompany.org ADMIN_EMAIL=you@... npm start
```

You are then responsible for renewing the certificate every 90 days. Caddy does
that for you, which is why Option 2 is preferred.

---

## What the app does about all this on its own

Not advice — enforced behaviour:

| Situation | What happens |
|---|---|
| No TLS configured | **Binds to `127.0.0.1` only.** Nothing leaves the machine. It prints what to set and why |
| `TRUST_PROXY=1` | Serves to the network, marks the cookie `Secure`, sends HSTS |
| `TLS_CERT` + `TLS_KEY` | Terminates TLS itself, same as above |
| `REDIRECT_PORT` set | A plain-HTTP listener that redirects to HTTPS, so colleagues typing the bare hostname are not met with an error |

The refusal to serve insecurely is deliberate. A pilot leaking sign-in codes
across the office network fails *invisibly*; a pilot nobody can reach fails
loudly, and a loud failure gets fixed.

Every response also carries `Strict-Transport-Security` (only when TLS is
actually on — promising a browser this origin is always HTTPS and then serving
it over HTTP would lock you out of your own machine), plus `nosniff`,
`Referrer-Policy: same-origin` and `X-Frame-Options: DENY`.

---

## The shortest path, concretely

1. Buy `ekpothe.xyz` — about US$10.
2. Create a Render account, connect the repo, set the three environment
   variables above.
3. Point the domain at Render (one DNS record; they show you exactly what).
4. Open the URL. It is already HTTPS.
5. Sign in with the admin code the server printed on first start.
6. Send colleagues the link.

**Total: about US$10 and half an hour.** No IT ticket, no certificate files, no
renewal to remember.

---

## Checks before you invite anyone

- [ ] The URL starts with `https://` and the browser shows no warning
- [ ] `http://yourdomain` redirects to `https://`
- [ ] The database is on a **persistent** disk, and you have taken one backup
      (`cp carpool.db carpool-$(date +%F).db`)
- [ ] `ALLOWED_EMAIL_DOMAINS` is your real work domain
- [ ] You signed in as admin and can see the pending queue
- [ ] You tried requesting access from a personal address and were refused
