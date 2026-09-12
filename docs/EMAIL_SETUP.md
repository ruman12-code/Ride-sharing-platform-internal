# Setting up email

**Nobody can sign in until this works.** Signing in means tapping a link sent to
your address — there is no password and no second door — so email is not a nice
extra here, it is the entrance. It also carries the notifications push cannot: a
colleague who never granted notification permission still learns that somebody
wants a seat.

Push is already set up; `npm run setup` generates those keys locally because
they are self-signed and need no account. Email needs credentials only you can
obtain, which is why this page exists.

---

## Send over HTTPS, not SMTP

This is the part that is not obvious and cost this pilot a launch.

**Most free hosting tiers block outbound SMTP.** Render blocks ports 25, 465 and
587 on free web services — deliberately, as anti-spam policy, since September
2025. On a host like that, no SMTP settings can work. The connection does not
get refused, it simply hangs, and the resulting timeout reads exactly like a
wrong password. We spent an afternoon on a correct Gmail App Password that never
had a chance.

Sending over an HTTP API uses port 443, which nothing blocks.

## Brevo, in about ten minutes

Free, no card, and it allows a single verified sender address — which is what
makes it usable when you own no domain.

1. Sign up at **brevo.com**.
2. **Settings (the gear, top right) → Senders & IPs → Senders → Add a sender.**
   Use an address you can read. Brevo emails it a six-digit **code**, which you
   paste back and click *Verify sender* — it is not a link you click in the
   message. A dedicated Gmail account (`ekpothe.dhaka@gmail.com`) is tidier than
   your personal one: colleagues see mail from Ekpothe, and replies do not land
   in your inbox.
3. **SMTP & API → API Keys → Generate a new API key.** Name it `Ekpothe`. Copy
   it — it is shown once.

Two values go into your host's dashboard:

```
BREVO_API_KEY=xkeysib-...
SMTP_FROM=Ekpothe <ekpothe.dhaka@gmail.com>
```

`SMTP_FROM` keeps its name for continuity, and must be the address you verified
in step 2. An unverified sender is rejected and the reason appears in the logs.

## Check it, before anything else

```
https://your-app.onrender.com/api/health?recheck=1
```

`"email":"ok"` means the key works and the account answered.

**It does not mean mail can be sent.** The check only proves the credential; an
unverified sender address passes it and then refuses every send. So look for
`lastEmailFailure` too — it appears once something has actually been attempted,
and carries Brevo's own words, usually *"Sender not valid: ... is not a
validated sender"*. Ask for a sign-in link, then reload the health page.

Then send yourself a real one: register, ask for a sign-in link, and **see which
folder it lands in.**

## About spam, honestly

With no domain of your own, mail sent from a `gmail.com` address through
Brevo's servers fails SPF and DKIM alignment — the From says Gmail, the sending
infrastructure is Brevo's. Consumer `gmail.com` publishes `p=none`, so nothing
bounces; it is simply weighted toward spam.

For a pilot of twenty colleagues this is manageable, and worth saying out loud
in your invitation: *"the first email may land in spam — mark it 'not spam' and
it won't happen again."*

It is properly fixed by owning a domain. Adding one to Brevo and letting it sign
with your DKIM aligns everything and the problem disappears. That is a
worthwhile afternoon once the pilot has proved it is worth keeping — not before.

## If your host allows SMTP

Leave `BREVO_API_KEY` unset and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS` and `SMTP_FROM` instead. The code still supports it, and where it
works it is one fewer account to hold. A paid Render instance unblocks 465 and
587; port 25 stays blocked everywhere.

The SMTP path also resolves the host to IPv4 before connecting, because
nodemailer picks at random between the IPv4 and IPv6 answers and many containers
have no IPv6 route — a coin flip between working and `ENETUNREACH`.
