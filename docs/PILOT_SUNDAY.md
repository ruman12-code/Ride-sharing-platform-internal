# Launching on Sunday

You are testing one thing: **will colleagues actually use a carpool?** Everything
below serves that and nothing else.

Today is **Friday 4 September**. Target: **Sunday 6 September**, the first
working day.

---

## The shape of this pilot

| | |
|---|---|
| **Invite-only** | No sign-up form. You hand out codes. |
| **No email addresses** | Not asked for, not stored. Colleagues pick a display name. |
| **Free hosting** | No domain purchase, no card. |
| **Clearly unofficial** | Stated at the door, beside the disclaimer, and in About. |
| **Small** | Five to eight colleagues on one corridor. |

### Why no email addresses

This is the change that lets you launch before speaking to the Data Protection
Officer, and it is a real reduction rather than a presentational one.

An address like `nusrat@giz.de` identifies a named person **and** their
employer, and ties a record of their daily movements to both. That is precisely
what makes a tool an employer's concern rather than a colleague's side project.

Without it the database holds a display name somebody chose and the journeys
they published. Much smaller to be responsible for — and entirely sufficient to
answer "will people use this?", which is the only question a pilot needs to
answer.

**Still do speak to the DPO** — before you scale, and ideally in the same week.
This lowers the stakes of launching first; it does not remove the conversation.

---

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
- [ ] **Mint codes** for five to eight colleagues — Admin → Invite a colleague.
      Write each name and code on paper. **They are shown once.**

Pick colleagues who *actually share your corridor*. Eight people scattered
across Dhaka will match nobody and you will conclude the idea failed when what
failed was the sample. Two or three drivers and four or five riders on one route
is the right shape.

## Saturday — 20 minutes

- [ ] Send each person their code individually, by whatever you normally use.
      **One code per person, sent privately.** A code in a group chat is a code
      anyone can use.
- [ ] Use the message below.
- [ ] Seed two or three of your own real rides for Sunday and Monday, so the
      first colleague to look does not find an empty app. **An empty marketplace
      is closed in ten seconds and never reopened.**

### The message to send

> Hi — I've built a small thing to help us share lifts to the office. It works
> out the fuel share so nobody has to haggle, and it takes about thirty seconds
> to post a ride.
>
> It's at https://ekpothe.fly.dev — your code is **XXXXXX**
>
> Two honest notes: it's something I made myself, not a GIZ system, and it's a
> trial. No email address is asked for, no location tracking, and I'll delete
> everything if we drop it.
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

- **No notifications yet.** The T−14h publish prompt and the T−45min reconfirm
  are written and tested but have no delivery channel — they need Teams or
  email, which the pilot deliberately avoids. **So colleagues must open the app
  to see a request.** Tell people to check it once on Sunday morning; without
  that, a driver may never notice a seat request. This is the single biggest
  difference from the finished product.
- **Ratings and the credit ledger are browser-side.** Rides, bookings and
  sign-in are server-backed and shared; ratings are not yet.
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
