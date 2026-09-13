# Putting Ekpothe on the internet

No card, no machine of yours left switched on, and nothing to install. Two free
accounts and about thirty minutes.

- **Neon** holds the data. Free Postgres, no card, and it does not expire.
- **Render** runs the app. Free, no card, deploys straight from GitHub, gives
  you HTTPS.

Both steps are things only you can do — they need your email and a browser.

---

## Why this shape

**Why not Render's own free Postgres.** It expires 30 days after it is created,
and 14 days later Render deletes it and everything in it. A pilot that dies a
month in, quietly, is worse than one that never started.

**Why not a file on disk.** This app used to keep everything in one SQLite file,
which is an excellent answer right up until it has to live somewhere nobody
owns. Free web services on Render and similar have no persistent disk at all —
not a small one, none — so a single-file database there is deleted on every
restart, and they restart often.

**Why the app sleeps, and what to do about it.** A free Render service spins
down after 15 minutes with no traffic and takes about a minute to wake. Step 5
keeps it awake during the hours colleagues actually use it, which also keeps the
timer running — the one that sends the T−45 reconfirmation and closes out
finished trips.

---

## 1. The database

1. Sign up at **neon.tech**. No card.
2. Create a project — name it `ekpothe`, and pick the region closest to Dhaka
   (Singapore).
3. Copy the connection string. It looks like:
   `postgresql://user:password@ep-something.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

That string is a password. It goes into Render's dashboard in step 3 and
nowhere else — not into git, not into a chat message.

Nothing to create inside it: the app builds its own tables on first boot.

## 2. Email — optional, and skip it for now

This section used to say "do this before deploying, nobody can sign in without
it". That was true once and it is what cost this pilot three separate launches:
a host that blocks SMTP, a provider that demanded an SMS that never arrived, and
then a provider account suspended without warning or explanation.

**The app no longer needs a mail server at all.** Approving a colleague mints a
six-character code, the administrator reads it off their own screen, and it goes
to that colleague however the two of them already talk — WhatsApp, a corridor,
a phone call. Notifications go by web push, which is HTTPS to Google and is not
blocked anywhere.

Set **nothing** here and the app works. Leave `SMTP_HOST`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_PORT`, `SMTP_FROM` and `BREVO_API_KEY` unset — and delete
them if they are already there. `SMTP_HOST` in particular is worse than useless
on Render: the mailer believes it has a working relay, every approval attempts a
send into a blocked port, and `/api/health` reports email as broken forever.

If you ever do want sign-in links, `EMAIL_SETUP.md` has the steps, and the honest
prerequisite is a domain of your own. Mail from a freemail address through a
third-party relay lands in spam often enough that it cannot be the only door.

## 3. The app

1. Sign up at **render.com** with GitHub. No card.
2. **New → Blueprint**, choose this repository. Render reads `render.yaml` and
   configures the service itself.
3. It will ask for every value marked "sync: false". Fill them in:

   | | |
   |---|---|
   | `DATABASE_URL` | the Neon string from step 1 |
   | `APP_URL` | `https://ekpothe.onrender.com` — Render shows the real name; it must match exactly |
   | `ADMIN_EMAIL` | your own personal address |
   | `ADMIN_BOOTSTRAP_CODE` | any secret string, **seven characters or more** — see below |
   | `VAPID_*` | run `npm run setup` locally once, or reuse the keys you already have |
   | `BREVO_API_KEY`, `SMTP_*` | leave blank. Delete them if present — see step 2 |

   `ADMIN_BOOTSTRAP_CODE` is your own first way in, and it exists because every
   other door needs somebody to open it for you: colleagues get a code from the
   administrator, and the administrator has nobody to get one from.

   Make it **seven characters or longer**. A six-character code is treated as a
   colleague's invite code and folded to upper case on its way to the server, so
   a six-character code with a lower-case letter in it can never match. The boot
   log warns if you pick one; it is easier not to.

   **Keep it set.** An earlier version of this document said to use it once and
   delete it, on the assumption that email would come back and a sign-in link
   would be the way home. Email is not coming back, and every other route into
   the administrator account expires: a session lasts ninety days, and a code
   lasts seven. Delete this and a lost phone in month four means editing the
   database by hand.

   It is a standing password, and that is what it is for. It costs nothing in
   practice: anybody who can read it can already read `DATABASE_URL` from the
   same page, so it hands out no access the host's own login did not already
   give. Make it long, and treat the Render dashboard as the place it lives.

   `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are generated **once**. Every
   phone that subscribes is tied to them, so regenerating later makes every
   existing subscription go silent with no error anywhere.

4. Deploy. The first build takes a few minutes.

## 4. Check it before you tell anybody

In Render's **Logs** tab you want:

```
push:       on
database:   ep-something.../neondb
email:      OFF — set SMTP_* or nobody is told they were approved
```

`email: OFF` is the correct state. It means the mailer is cleanly inert rather
than pretending to work. `email: BROKEN` means an `SMTP_*` value is still set
and should be deleted.

Then on your own phone, in this order — each step is the prerequisite for the
next, and getting them the wrong way round is the most common way to conclude
the app is broken when it is not:

1. Open the URL. Choose **I need an account** and register with the address you
   set as `ADMIN_EMAIL`. Tick the confirmation box. You are approved instantly
   and as an administrator, because the address matches.

   You must do this *first*. `ADMIN_BOOTSTRAP_CODE` signs you in to the
   administrator account; it does not create one. Used before you have
   registered, it says so rather than saying the code is wrong.

2. Choose **I have a code** and enter `ADMIN_BOOTSTRAP_CODE` exactly as you set
   it in Render — it is case-sensitive. You land signed in as the admin.

3. Leave `ADMIN_BOOTSTRAP_CODE` set. It is your way back in when this phone is
   lost or this session runs out — see step 3 above.

4. Turn on notifications when asked.

5. Open the URL in a private window as a second colleague and register. Approve
   them from the **Admin** screen — it shows a six-character code and a **Copy
   message** button with WhatsApp-ready text in English and Bangla. Enter that
   code in the private window under **I have a code**.

6. Post a ride as one and book it as the other. You should get a notification
   without the app being open.

## 5. Keep it awake while people are using it

A free Render service sleeps after 15 idle minutes. The first colleague of the
morning would wait a minute for it, and the timer cannot run while it is down.

Set up a free scheduled ping at **cron-job.org** (no card):

- URL: `https://your-app.onrender.com/api/health`
- Every 10 minutes
- **Only between 05:00 and 23:00 Dhaka time**

The hours matter. Render gives 750 instance-hours a month and a month is about
730 hours, so pinging around the clock leaves almost no margin — and a service
that exhausts its hours is suspended until the next month. 18 hours a day is
about 540, a comfortable margin, and the app is awake whenever anybody would
open it. Overnight it sleeps, which costs nothing: the first request wakes it.

## 6. Backups

Neon keeps its own point-in-time history, which is more than the old single file
ever had. Take your own copy anyway, monthly:

```sh
pg_dump "$DATABASE_URL" > "ekpothe-$(date +%F).sql"
```

## Every change after this

Push to the branch. Render rebuilds and redeploys on its own. Colleagues who are
signed in stay signed in — sessions last ninety days and roll forward on every
visit.

## If you outgrow the free tier

The honest signals are colleagues complaining about the wait on first use in the
morning, or Neon's storage filling. Both are answered by paying a few dollars a
month on either service; nothing in the app has to change.


## 5. When somebody cannot get in

A code works once. A session lasts ninety days. So "I can't get in" is a normal
thing to hear from a colleague who has changed phone, cleared their browser, or
simply been using the app since the spring — it is not a sign that anything is
broken, and it is not a reason to remove and re-add them.

Open **Admin → Colleagues who are in**, find their name, and press **New code**.
You get a fresh six-character code and a **Copy message** button with the whole
instruction in English or Bangla, ready to paste into WhatsApp. Their previous
code stops working at that moment, which is deliberate: two live codes for one
person means the one you sent last month still opens the door.

Your own row has the same button, labelled **Code for me**. It signs you in on a
second device — a laptop, a new phone you are setting up today. It expires in
seven days like any other, so it is not a key to keep in a drawer. The key you
keep is `ADMIN_BOOTSTRAP_CODE`, in Render.

Removing somebody is different and lives next to it: **Remove** suspends the
account, ends their session immediately, and kills any code they were holding.
