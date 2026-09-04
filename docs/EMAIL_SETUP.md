# Setting up email

Email is one of the two ways Ekpothe reaches a colleague who is not looking at
the app. Push is the other; each covers the other's failure. **Push is already
set up** — `npm run setup` generated the keys, because they are self-signed and
need no account. Email needs credentials only you can obtain, so it is here.

Without email the app still pushes to phones. With it, a colleague who never
granted notification permission still finds out that somebody wants a seat.

---

## Which provider

| | Free? | Setup | Good for |
|---|---|---|---|
| **Brevo** | 300 emails/day | ~10 min | **Recommended.** Proper transactional sending, generous free tier |
| **Resend** | 100/day, 3k/month | ~5 min | Simplest. Needs a domain for anything beyond testing |
| **Gmail app password** | ~500/day | ~5 min | Quickest, but see the caveats |
| Your own domain via the host | varies | varies | Later, once you buy a domain |

At eight colleagues, a busy day is perhaps thirty emails. Any of these is ample.

---

## Option A — Brevo *(recommended)*

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
