# Launching on Sunday

You are testing one thing: **will colleagues actually use a carpool?** Everything
below serves that and nothing else.

Today is **Friday 4 September**. Target: **Sunday 6 September**, the first
working day.

---

## The shape of this pilot

| | |
|---|---|
| **Self-registration** | Colleagues sign themselves up. You approve. No codes to hand out. |
| **Personal emails only** | Work addresses are refused, with the reason. |
| **Notifications** | A driver is told a seat was asked for without opening the app. |
| **Free hosting** | No domain purchase, no card. |
| **Clearly unofficial** | Stated at the door, beside the disclaimer, and in About. |
| **Small** | Five to eight colleagues on one corridor. |

### Why personal email addresses only

This is what lets you launch before the Data Protection Officer conversation,
and it is a real reduction rather than a presentational one.

An address like `nusrat@giz.de` identifies a named person **and** their
employer, and ties a record of their daily movements to both. That is precisely
what turns a tool into an employer's concern rather than a colleague's side
project.

A personal address does not carry the employer. The database holds an address
somebody already uses for personal things, a name they chose, and their
journeys. The optional *official name* and *department* fields exist only so you
can recognise who is asking — and a colleague who would rather not say leaves
them blank and is approved anyway.

Work addresses are **refused with the reason shown**, because reaching for your
work address is the natural thing to do and a colleague deserves an explanation
rather than "invalid".

**Still speak to the DPO** — before you scale, and ideally the same week. This
lowers the stakes of launching first; it does not remove the conversation.

### How a colleague joins

1. They open the link and tap **I need an account**.
2. Personal email, a password, and what colleagues should call them. Optionally
   their official name and department.
3. **You approve them** in Admin, where you can see those optional details.
4. They sign in with what they chose. Nothing to relay.

---

## Notifications — what to set

Two channels, both attempted, because they fail differently: push is silent if
permission was revoked, email lands in a folder nobody watches.

**Email** works as soon as SMTP is configured. **Push** — a real notification on
the phone — needs a pair of keys you generate once:

```bash
npx web-push generate-vapid-keys
```

Then set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. No third party is involved:
the payload is encrypted to the subscription, so the browser vendor's push
service relays bytes it cannot read.

Without either, the server says so at startup — `notify: NONE — colleagues must
open the app to see requests` — rather than letting you find out on Sunday.

## Free hosting — the recommendation

The trap on free tiers is **ephemeral disk**. Most free plans wipe the filesystem
on every restart or redeploy, and Ekpothe keeps everything in one SQLite file. A
free plan without a persistent volume means **your pilot data disappears at the
worst moment** — usually just as you want to show somebody the numbers.

| Option | Free? | Persistent data? | HTTPS | Verdict |
|---|---|---|---|---|
| **Fly.io** + 1 GB volume | Free allowance covers a small app | **Yes** — volumes persist | Automatic | **Recommended** |
| **Oracle Cloud Always Free** | Yes, indefinitely | Yes — a real VM | Via Caddy | Best long-term, ~2 hours to set up |
| Render free | Yes | **No** — no disk on free | Automatic | Fine to demo, not to pilot |
| Railway / Koyeb free | Trial credits | Usually not | Automatic | Same caveat |

**Take Fly.io for Sunday.** One config file, HTTPS on `ekpothe.fly.dev`
immediately, and a volume that survives redeploys.

> Free-tier terms change. Check what Fly currently includes before relying on
> it, and take the backup in the checklist regardless.

### Fly.io, concretely

```bash
# once
curl -L https://fly.io/install.sh | sh
fly auth signup

# in the project
fly launch --no-deploy          # name it ekpothe; it writes fly.toml
fly volumes create ekpothe_data --size 1 --region sin   # Singapore is nearest
fly deploy
```

`fly.toml` needs the volume mounted and the app told where its database lives:

```toml
[mounts]
  source = "ekpothe_data"
  destination = "/data"

[env]
  DB_PATH = "/data/carpool.db"
  TRUST_PROXY = "1"
  ACCESS_MODE = "invite"
  APP_URL = "https://ekpothe.fly.dev"
```

`TRUST_PROXY=1` matters: Fly terminates TLS for you, so this tells Ekpothe to
serve the network and mark its session cookie `Secure`. Without it the app binds
to localhost and nobody can reach it — deliberately.

Then read your admin code out of the logs:

```bash
fly logs | grep "ADMIN CODE"
```

---

## Friday evening — about 90 minutes

- [ ] **Deploy.** Follow the Fly steps above. Stop when
      `https://ekpothe.fly.dev` loads the code screen.
- [ ] **Sign in** with the admin code from the logs. Choose your display name.
- [ ] **Take a backup** so you know how: `fly ssh console -C "cp /data/carpool.db /data/backup.db"`
- [ ] **Walk the whole thing once yourself**: publish a ride on your real
      corridor, then find and book one. If anything is confusing to you, it will
      be worse for everybody else.
- [ ] **Turn on notifications** when the app offers, and check you get one:
      publish a ride from a second browser and request a seat on it.

Pick colleagues who *actually share your corridor*. Eight people scattered
across Dhaka will match nobody and you will conclude the idea failed when what
failed was the sample. Two or three drivers and four or five riders on one route
is the right shape.

## Saturday — 20 minutes

- [ ] Send the link to five to eight colleagues. **The link is safe to put in a
      group chat** — registering does nothing until you approve it.
- [ ] Use the message below.
- [ ] **Watch for registrations** and approve them. Admin → *Waiting for
      approval* shows the official name and department if they gave them.
- [ ] Seed two or three of your own real rides for Sunday and Monday, so the
      first colleague to look does not find an empty app. **An empty marketplace
      is closed in ten seconds and never reopened.**

### The message to send

> Hi — I've built a small thing to help us share lifts to the office. It works
> out the fuel share so nobody has to haggle, and it takes about thirty seconds
> to post a ride.
>
> It's at https://ekpothe.fly.dev — tap "I need an account". **Please use a
> personal email, not your GIZ one** — that's deliberate, it keeps work data out
> of this entirely. I'll approve you and you're in.
>
> Two honest notes: it's something I made myself, not a GIZ system, and it's a
> trial. No location tracking, and I'll delete everything if we drop it.
>
> Would you try posting your Sunday commute? Even if nobody matches, knowing
> that is useful.

Adjust the tone to how you normally write. Do not oversell it — a colleague who
tries something modest and finds it works tells other people. A colleague who
tries something oversold does not.

## Sunday — the day

- [ ] **07:00** — check the app has at least two published rides. If not, add one.
- [ ] **Mid-morning** — Admin → *This week*. Look at rides published and searches
      that found nothing.
- [ ] **Ask two people directly** what happened. Not "did you like it" — ask
      *"did you post a ride, and if not, what stopped you?"* The answer to the
      second is worth more than everything on the dashboard.
- [ ] **Evening** — back up the database.

## The week after

- [ ] Wednesday: back up, read the zero-result searches. Those are routes people
      want and cannot get — the demand map the old spreadsheet could never give you.
- [ ] Thursday: ask everyone for one sentence of feedback.
- [ ] **Then decide.** Criteria below.

---

## What counts as success

The old spreadsheet managed **20 postings in five months** — 0.185 per working
day — and **could not establish that a single ride ever happened.**

Against that:

| Signal | Reading |
|---|---|
| **One completed trip** | Already beats five months of the spreadsheet |
| 3+ rides posted in week one | Real interest. Continue |
| Somebody posts a *second* time without prompting | The strongest signal there is |
| Rides posted but never booked | Matching problem, not an interest problem — narrow the corridor |
| Nothing after a personal ask | Honest answer. Stop, and you learned it in a week for nothing |

**A pilot that fails clearly in one week is a good outcome.** It cost you a
weekend and no money, and it stops you spending months on something colleagues
did not want.

### The one number to watch

**Completed trips.** Not sign-ups, not page views. The old tool could not prove a
single ride happened; if yours can prove three, you have something worth taking
to management.

---

## If it works — the next steps, in order

1. **Speak to the GIZ Data Protection Officer.** Take [`DPIA.md`](DPIA.md) and
    [`DATA_SECURITY.md`](DATA_SECURITY.md). You will now be arriving with
    evidence rather than a proposal.
2. Buy a domain. `.com.bd` is worth the paperwork once it is real.
3. Add email sign-in so joining is self-service.
4. Then, and only then, consider the Microsoft 365 deployment.

---

## Known gaps, so nothing surprises you on the day

- **Ratings and the credit ledger are browser-side.** Rides, bookings, sign-in
  and notifications are server-backed and shared; ratings are not yet.
- **The T−14h "driving tomorrow?" prompt is not scheduled.** The T−45min
  reconfirm is. Drivers publish by opening the app rather than by tapping a
  notification the night before.
- **On iPhone, push needs the app added to the Home Screen first** (Safari →
  Share → Add to Home Screen). Email still reaches them either way — worth
  saying in your message if colleagues use iPhones.
- No load testing. At eight colleagues this does not matter.
- The DPIA is unsigned. Deliberate, and the reason the pilot collects so little.

## What is verified working across two colleagues

Driven end to end in two separate browsers against the pilot server:

| | |
|---|---|
| Ruman signs in with the admin code, sets his name | ✓ |
| Ruman mints a code for Nusrat and hands it over | ✓ |
| Ruman publishes Uttara → Gulshan-2 for tomorrow | ✓ stored server-side |
| **Nusrat, on a different device, sees Ruman's ride** | ✓ under his real name |
| Nusrat answers the counterfactual and books a seat | ✓ stored server-side |
| Two people racing for the last seat | ✓ one wins, one is told plainly |
| A work address tries to register | ✓ refused, with the reason |
| Registering, then signing in before approval | ✓ told they are waiting |
| **Driver is told "Nusrat wants a seat" without opening the app** | ✓ by email and push |
| Driver accepts → rider is told | ✓ |
| Contact details after acceptance | ✓ both ways; a third party gets nothing |
