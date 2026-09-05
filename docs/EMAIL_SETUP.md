# Setting up email

**Nobody can sign in until this works.** Signing in means tapping a link sent to
your address — there is no password and no second door — so email is not a nice
extra here, it is the entrance.

It also carries the notifications that push cannot: a colleague who never
granted notification permission still learns that somebody wants a seat.

**Push is already set up** — `npm run setup` generated those keys, because they
are self-signed and need no account. Email needs credentials only you can
obtain, which is why this page exists.

---

## Which provider

| | Free? | Setup | Good for |
|---|---|---|---|
| **Gmail, from a dedicated account** | ~500/day | ~5 min | **Recommended.** See below |
| **Brevo** | 300 emails/day | ~10 min | Better at scale; worse deliverability without a domain |
| **Resend** | 100/day, 3k/month | ~5 min | Simplest. Needs a domain for anything beyond testing |
| Your own domain via the host | varies | varies | Later, once you buy a domain |

At twenty colleagues, a busy day is perhaps fifty emails. Any of these is ample;
the difference between them is deliverability, not volume.

---

## Why a dedicated Gmail account, and not Brevo

This reverses an earlier recommendation in this file, for a reason that only
became decisive once the sign-in link became the **only** way in.

You have no domain, so `SMTP_FROM` is a `gmail.com` address. Sending mail *from*
gmail.com through Brevo's servers means SPF names Brevo's IP rather than
Google's, and DKIM is signed by Brevo's domain rather than gmail.com — so
neither aligns with the From address. Consumer gmail.com publishes `p=none`, so
nothing bounces. It is simply weighted toward spam.

For a newsletter that is a nuisance. Here, the message being filtered is the one
that lets a colleague into the app, and the form deliberately says "a link is on
its way" whether or not it arrived, so nobody can tell you it did not. That is
the failure that ends a pilot quietly.

Sending through Google's own servers with a gmail.com From aligns perfectly, and
your colleagues are on exactly the personal inboxes that trust it most.

**A separate account, not your personal one.** A Gmail App Password grants broad
access to that mailbox, so if the server is ever compromised the blast radius
should be an account that holds nothing. It is better for the app too:
colleagues see mail from Ekpothe, and their replies do not land in your inbox.

Revisit Brevo if you ever put a real domain in front of this — with a domain you
control, its alignment is fine and its sending reputation is better than any
individual account's.

## Option A — a dedicated Gmail account *(recommended)*

1. Create a new Google account, e.g. `ekpothe.dhaka@gmail.com`. Free, no card.
2. Turn on 2-Step Verification on it — App Passwords do not exist without it.
3. Google Account → Security → App passwords → create one named "Ekpothe".
4. Use the 16-character password Google shows. **Not** the account password.

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ekpothe.dhaka@gmail.com
SMTP_PASS=<the 16-character app password, no spaces>
SMTP_FROM=Ekpothe <ekpothe.dhaka@gmail.com>
```

Then prove it, before anything else:

```sh
npm run preflight -- your.own@email.com
```

That opens a real connection, authenticates, and sends a real message. Check
**which folder it lands in**. If it is spam, mark it "not spam" and say so in
your invitation message — a link nobody can find is a link nobody can use.

## Option B — Brevo

1. Sign up at **brevo.com** with your personal email. Free, no card.
2. **SMTP & API** → **SMTP** tab.
3. Copy the login and the SMTP key it shows.

```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<the login Brevo shows>
SMTP_PASS=<the SMTP key>
SMTP_FROM=Ekpothe <your.personal@gmail.com>
```

Brevo lets you send from an address you have verified, so verify the personal
address you intend to use under **Senders**.

## Option B — Gmail app password *(quickest)*

Works, with two caveats worth knowing before you choose it.

1. Your Google account needs **2-Step Verification** on.
2. Go to **myaccount.google.com/apppasswords**, create one named "Ekpothe".
3. Use the 16-character password Google gives you — **not** your Gmail password.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.personal@gmail.com
SMTP_PASS=<the 16-character app password>
SMTP_FROM=Ekpothe <your.personal@gmail.com>
```

**Caveat 1 — everything comes from your personal address.** Colleagues will see
your Gmail. For a pilot run by a named colleague that is arguably honest, but
decide deliberately rather than discover it.

**Caveat 2 — an app password is full access to that mailbox.** If the server is
compromised, so is your Gmail. Brevo's key can only send, which is why it is the
recommendation.

## Option C — Resend

1. Sign up at **resend.com**, create an API key.

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<your API key>
SMTP_FROM=Ekpothe <onboarding@resend.dev>
```

`onboarding@resend.dev` works without a domain but **only sends to your own
verified address** — fine for testing the wiring, not for colleagues. For real
use you need a domain, which is why this sits below Brevo for now.

---

## Where the values go

**Locally:** in `.env.local`, which `npm run setup` created and which is
git-ignored. The server reads it automatically.

**Deployed:** in your host's environment variables (Fly secrets, Render's
Environment tab). **Never commit them.**

```bash
# Fly
fly secrets set SMTP_HOST=... SMTP_USER=... SMTP_PASS=... SMTP_FROM=...
```

---

## Checking it works

Start the server and read the first lines:

```
notify:     push + email          ← both live
notify:     email only            ← VAPID keys missing
notify:     NONE                  ← neither; colleagues must open the app
```

Then test the loop for real, which is the only test that means anything:

1. Publish a ride from one browser.
2. Request a seat from another, signed in as somebody else.
3. **The driver's inbox should have "… wants a seat".**

If it does not arrive, the server logs the reason — look for `mail send failed`.
The most common causes are a wrong port (587, not 465, unless your provider says
otherwise) and an unverified sender address.

---

## A GDPR note, since colleagues are GIZ staff

A third-party mail provider that handles your colleagues' addresses is a **data
processor**. For a small voluntary pilot using personal addresses this is
ordinary and low-risk — it is the same shape as any mailing list — but it is one
of the things to mention when you speak to the Data Protection Officer, rather
than one to discover afterwards.

The pilot already keeps this small: it holds personal addresses rather than
work ones, and the only thing ever emailed is a short notification with no
journey details beyond a time and a pickup point.
