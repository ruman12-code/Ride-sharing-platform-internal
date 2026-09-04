# Getting Ekpothe online — domains, hosting, and the GIZ question

Written for the pilot phase. No prior knowledge of certificates or DNS assumed.

> **Read §0 first.** Now that colleagues are GIZ staff, one non-technical
> question outranks every technical one on this page.

---

## 0. GIZ changes the picture — settle this before anything else

GIZ (Deutsche Gesellschaft für Internationale Zusammenarbeit GmbH) is a German
federal enterprise. Three consequences follow, and none are about code.

**GDPR applies, alongside Bangladesh's PDPA 2026.** Names, work emails and daily
commute patterns of GIZ staff are personal data under EU law. GDPR is stricter
than the PDPA in several places that matter here: lawful basis, data subject
rights, and breach notification within 72 hours.

**The "household exemption" does not cover this.** GDPR excludes purely personal
or household activity — a private address book. A tool built for colleagues,
gated on the employer's email domain, processing their commutes, is not that. If
you run it on your own server, you are plausibly a **data controller** in your
own right, with the obligations that carries.

**GIZ has a Data Protection Officer and IT policies about exactly this.** Tools
that handle staff data outside sanctioned systems are what those policies are
for.

### What to actually do

**Speak to GIZ's Data Protection Officer and your IT focal point before you
invite anybody.** Not after. Retrofitting consent for staff data already
collected is far harder than getting a nod first, and a well-received pilot that
was cleared beforehand is a much easier thing to pitch upward later.

You are in a strong position for that conversation:

- No GPS, no location tracking, no home addresses — neighbourhood level only
- No third-party services: no Google, no analytics, no trackers
- Self-service export and erasure already built
- A written DPIA ([`DPIA.md`](DPIA.md)) that names the risks it could not
  design away, rather than only the ones it solved
- [`DATA_SECURITY.md`](DATA_SECURITY.md), written to be handed over unedited

Take those documents to the meeting. They are the answer to most of what will be
asked.

### Two naming cautions

1. **Do not use anything implying GIZ endorsement** — not in the domain, not in
   the branding, not in how you describe it. "Ekpothe, a voluntary tool built by
   a colleague" is accurate and safe. Anything that reads as a GIZ system is not
   yours to claim.
2. **Do not put GIZ in the domain name.** `ekpothe-giz.org` invites exactly the
   misunderstanding above.

The app already carries the right framing: the email a colleague receives says
*"Ekpothe is a voluntary tool built by a colleague. It is not an official
system."*

---

## 1. The `.bd` domain question

### What I could verify

I checked DNS directly. Results:

| Name | Resolves? | Meaning |
|---|---|---|
| `ekpothe.bd` | **No** | No DNS record exists today |
| `google.bd` | Yes | Second-level `.bd` names **do** exist |
| `btcl.bd` | Yes | The registry operator's own |
| `grameenphone.bd` | No | Even a major operator uses `.com.bd` |
| `google.com.bd`, `du.ac.bd`, `bangladesh.gov.bd` | Yes | Third-level is the normal form |

### What that does and does not tell you

**"No DNS record" is not the same as "available."** Plenty of registered domains
have no record pointing anywhere. I cannot run a `whois` against the `.bd`
registry from here, so **I cannot confirm `ekpothe.bd` is free** — only that
nothing is currently published on it.

### What you should expect, and must confirm with BTCL

`.bd` is run by **BTCL** (Bangladesh Telecommunications Company Limited) and is
among the more restrictive country domains:

- **Third level is the normal path**: `.com.bd`, `.net.bd`, `.org.bd`,
  `.edu.bd`, `.ac.bd`, `.gov.bd`. That `grameenphone.bd` does not resolve while
  `grameenphone.com.bd` does tells you how the country actually registers names.
- **Second level (`ekpothe.bd`) is exceptional.** The handful that exist belong
  to the registry itself or to very large entities. Treat it as unlikely.
- **Registration is manual and document-backed** — typically a trade licence or
  National ID, submitted to BTCL, processed by people over days or weeks.
- Cost is low (roughly Tk 800–1,500/year) but time and paperwork are the real
  price.

**Verify at [bdia.btcl.com.bd](https://bdia.btcl.com.bd) before planning around
it.** Do not take my word or anyone else's on availability.

### My recommendation for the pilot: don't

Not because `.bd` is bad — because it is the wrong tool for this stage.

A pilot needs to start this month, and to be abandonable without loss if
colleagues do not use it. A registration requiring a trade licence and weeks of
back-and-forth is friction on the exact thing you are trying to test.

**`.bd` makes sense later**, if the pilot works and GIZ adopts it. A locally
registered domain is genuinely the right long-term home for a Dhaka office tool.
It is a reward for success, not a prerequisite for trying.

---

## 2. Realistic domain options, ranked

| Option | Cost/yr | Time to get | Notes |
|---|---|---|---|
| **`ekpothe.xyz` / `.app` / `.link`** | ~US$3–12 | **5 minutes** | Card, done. Recommended for the pilot |
| `ekpothe.com` | ~US$12 | 5 minutes | If free. Most recognisable |
| **No domain at all** | **Free** | **0** | Use the platform's own URL — see §3 |
| `ekpothe.com.bd` | ~Tk 1,000 | days–weeks | Documents to BTCL. Good later |
| `ekpothe.bd` | ~Tk 1,500 | weeks, if ever | Second level; expect refusal |

Registrars that work fine from Bangladesh with an international card:
**Porkbun**, **Namecheap**, **Cloudflare Registrar** (at cost, no markup).

### The genuinely free option

Render, Railway and Fly.io all give you a working HTTPS URL on their own domain
the moment you deploy — something like `ekpothe.onrender.com`. It is not pretty,
it costs nothing, and it works today.

**For a pilot, this is a perfectly good answer.** Ship on the free subdomain,
find out whether colleagues use it, and buy a domain when you know it is worth
having. Point the domain at the same deployment later without changing anything
else.

---

## 3. Hosting — pick one

### Option A — Render *(recommended for the pilot)*

```
Build command:  npm install && npm run build && npm run build:server
Start command:  node dist-server/server/index.js
```

Environment variables:

```
TRUST_PROXY=1
ALLOWED_EMAIL_DOMAINS=giz.de
AUTO_APPROVE_DOMAINS=giz.de
ADMIN_EMAIL=your.name@giz.de
APP_URL=https://ekpothe.onrender.com
```

- **HTTPS from the first request.** No certificate work at all.
- **Cost:** free tier works; ~US$7/month keeps it awake and gives a persistent disk.
- **Time:** about fifteen minutes.
- **Watch out:** on the free tier the service sleeps when idle, so the first
  visit of the morning takes a few seconds. And **you must attach a persistent
  disk for `carpool.db`**, or the database is wiped on every redeploy. Set
  `DB_PATH` to a path on that disk.

### Option B — Your own VPS with Caddy *(most control)*

A US$5/month machine from Hetzner, DigitalOcean or Linode.

```
# /etc/caddy/Caddyfile — the entire configuration
ekpothe.xyz {
	reverse_proxy localhost:8080
}
```

Caddy obtains a free Let's Encrypt certificate on the first request and renews
it forever. Then:

```bash
TRUST_PROXY=1 ALLOWED_EMAIL_DOMAINS=giz.de ADMIN_EMAIL=you@giz.de npm start
```

An hour the first time; the machine is then yours to keep patched.

### Option C — Ekpothe terminates TLS itself

```bash
TLS_CERT=/etc/letsencrypt/live/you/fullchain.pem \
TLS_KEY=/etc/letsencrypt/live/you/privkey.pem \
REDIRECT_PORT=80 \
ALLOWED_EMAIL_DOMAINS=giz.de ADMIN_EMAIL=you@giz.de npm start
```

You then own certificate renewal every 90 days. Caddy does that for you, which
is why Option B is preferred.

---

## 4. What HTTPS is, briefly

Over plain HTTP, every piece of equipment between a colleague's phone and your
server can read what passes: the office wifi access point, the router, the ISP.
That includes their access code and their **session cookie — which *is* their
identity.** Copy it and you are them.

HTTPS encrypts it. The equipment still moves the data but can no longer read it.

**Certificates are free and automatic now.** Let's Encrypt issues them in
seconds and renews them itself. If you had heard certificates were expensive and
bureaucratic, that stopped being true around 2016.

**The app enforces this rather than advising it.** With no TLS configured it
binds to `127.0.0.1` and refuses to serve the network, printing what to set. A
pilot leaking access codes across the office fails *invisibly*; a pilot nobody
can reach fails loudly, and loud failures get fixed.

---

## 5. Email — what makes joining automatic

Without SMTP the app cannot verify that whoever typed `nusrat@giz.de` can read
that mailbox, so it will not auto-approve. Requests queue for you instead.

With SMTP configured, a `@giz.de` address is approved automatically and the code
is emailed to it. **The code never comes back to the browser** — that is the
whole point.

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=ekpothe@yourdomain
```

Three practical notes:

1. **GIZ's own mail servers will probably not relay for you** without IT
   involvement. That is another reason for the §0 conversation.
2. **A third-party sender (Brevo, Resend, Mailgun) becomes a GDPR data
   processor** the moment it handles `@giz.de` addresses. You would need a
   processor agreement. Raise it with the DPO rather than assuming a free tier
   is a free decision.
3. **Manual approval needs no email at all** and is perfectly workable at 150
   staff. You approve, you send the code by Teams or WhatsApp. Start here if §0
   is unresolved.

---

## 6. The shortest honest path

1. **Talk to the GIZ DPO and IT focal point.** Take `DPIA.md` and
   `DATA_SECURITY.md`. *(§0 — do not skip.)*
2. Deploy to Render on its free subdomain. No domain purchase.
3. Set `ALLOWED_EMAIL_DOMAINS=giz.de` and `ADMIN_EMAIL=you@giz.de`.
4. Leave SMTP unset at first — approve the first colleagues by hand and send
   codes yourself. It is slower and it is one fewer conversation.
5. Sign in with the admin code printed at first start.
6. Invite five or six colleagues who commute your corridor.
7. **Only if it gets used:** buy a domain, add SMTP for self-service joining,
   and consider `.com.bd`.

Total cost to find out whether this works: **nothing**.

---

## Before you invite anyone

- [ ] GIZ DPO / IT spoken to, and comfortable
- [ ] URL starts with `https://` with no browser warning
- [ ] `http://` redirects to `https://`
- [ ] `carpool.db` is on a **persistent** disk, and you have taken one backup
- [ ] `ALLOWED_EMAIL_DOMAINS=giz.de`
- [ ] You tried a personal address and got *"Sorry! You are not in our
      organisation…"*
- [ ] You signed in as admin and can see the pending queue
