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

## 2. Email

Do this before deploying. **Nobody can sign in without it** — the sign-in link
is the only door.

It goes over HTTPS rather than SMTP, and that is not a preference: Render's free
web services block outbound ports 25, 465 and 587 as anti-spam policy. On a free
instance an SMTP connection simply hangs, and the timeout reads exactly like a
wrong password. `EMAIL_SETUP.md` has the steps.

You need two values: `BREVO_API_KEY` and `SMTP_FROM`.

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
   | `BREVO_API_KEY` | the API key from step 2 |
   | `SMTP_FROM` | `Ekpothe <your-verified-sender>` — must be the address you verified in Brevo |
   | `VAPID_*` | run `npm run setup` locally once, or reuse the keys you already have |

   `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are generated **once**. Every
   phone that subscribes is tied to them, so regenerating later makes every
   existing subscription go silent with no error anywhere.

4. Deploy. The first build takes a few minutes.

## 4. Check it before you tell anybody

In Render's **Logs** tab you want:

```
push:       on
email:      relay reachable and accepted the login
database:   ep-something.../neondb
```

If it says `email: BROKEN`, stop and fix that. Everything downstream of a broken
mailer is invisible failure: the sign-in form says "a link is on its way"
whether or not it arrived, deliberately, so that it cannot be used to find out
who has registered — which means you cannot tell from the outside.

To re-test the mailer after correcting a value, without waiting out a redeploy:

```
https://your-app.onrender.com/api/health?recheck=1
```

Then on your own phone:

1. Open the URL and register with your personal address — approved instantly,
   because it matches `ADMIN_EMAIL`.
2. Ask for a sign-in link. Tap it. You should land signed in.
3. Turn on notifications when asked.
4. Post a ride. Open the URL in a private window as a second colleague, register
   and approve yourself from the admin screen, and book the seat.
5. You should get a notification without the app being open.

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
