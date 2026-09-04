# What happens to your data

Written to be read by a colleague who is right to ask, and to be handed over
without editing. Everything below describes what the code actually does today —
where something is a limitation, it says so rather than working around the
question.

*(A shorter version for colleagues who just want the gist is at the end.)*

---

## The short answer

- Your **location is never tracked.** There is no GPS anywhere in this app.
- Your **home address is never stored.** Journeys are recorded as
  neighbourhoods — "Uttara Diabari", not where you live.
- Your **phone number is never listed.** It is shown to one colleague, once a
  driver has accepted them, and every time that happens it is recorded.
- **No money passes through it.** It notes who owes whom; you settle it yourselves.
- **Nothing leaves the organisation.** No Google, no analytics, no third party
  of any kind.
- Everything **you** can see about yourself, you can also **export or delete**,
  yourself, without asking anyone.

---

## 1. Who can get in

Three gates, in order. A stranger who finds the web address gets past none of
them.

**Gate 1 — the email domain.** Only addresses on the organisation's work domain
may even ask. A personal Gmail address is refused at the form, with the reason
shown. A colleague's brother, a former employee's personal address, or somebody
who guessed the URL never reaches the queue.

**Gate 2 — a person approves you.** A request creates a *pending* entry that can
do nothing at all. An administrator who recognises the name approves it. This is
a human looking at a human, which is the gate that actually matters.

**Gate 3 — a code issued to you alone.** On approval, a six-character code is
generated for that one email address, sent to you privately, and **consumed the
first time it is used.** Forwarding it to somebody else does not work: it is
bound to your address and dies on first use.

That third gate is the difference from a shared password. A shared password
proves somebody knows a secret. A single-use code issued to one address proves
it is *you*.

**Two more properties worth knowing:**

- Codes are stored **hashed** (scrypt). If somebody stole a copy of the database
  they would still hold no working code.
- Being suspended takes effect **immediately** — the live session is deleted,
  not left running until next sign-in.

### The honest limitation

Anyone who obtains *your* code before you use it could sign in as you. That is
why it is sent privately and expires in seven days. It is a real risk and it is
smaller than it sounds — the person would need your specific code, within the
window, before you used it — but it is not zero, and this is a pilot rather than
a bank.

---

## 2. What is actually stored

| Stored | Not stored |
|---|---|
| Name, work email | Home address |
| Journeys as **zone pairs** — "Uttara → Gulshan-2" | GPS, live location, any location trace |
| Departure times | Where you actually were |
| Bookings and who was in the car | Payment or bank details |
| How you would otherwise have travelled | National ID, date of birth |
| A contact detail **you choose to enter** | Anything from your phone or its contacts |
| Star ratings (shown only as averages) | Who rated whom |

### Your contact detail

You are not required to enter one. If you do:

- It appears in **no list, no search, no export**.
- It is released to exactly one colleague, and only after **a driver has
  accepted a specific rider**. Both directions — you need theirs to say "I'm at
  the gate", they need yours to say "two minutes away".
- **Every release is recorded**: which booking, who saw it, when. So "who has my
  number?" has an answer rather than a shrug.
- A request a driver declines discloses nothing, and declining is silent — the
  rider is told the seat is unavailable, never who declined or why.

This shape is deliberate. A browsable directory of numbers could be harvested by
anyone who got in. An exchange cannot be harvested without a named driver
agreeing, one rider at a time.

### The thing that genuinely is visible

**A regular commute tells colleagues that you travel from a particular
neighbourhood at a particular time on particular days.** That is not a leak —
it is the feature. It is also unavoidable in any carpooling system, and you
should know it before you set one up.

What limits it: it is a *neighbourhood*, not a street or a building. You can
pause or delete a commute profile instantly. Only approved colleagues see it.
And participating is entirely voluntary.

If that trade is not one you want to make, do not create a recurring profile.
You can still use one-off rides, or not use it at all, and nobody is told either
way.

---

## 3. Where the data physically is

**During the pilot:** a single file (`carpool.db`) on one server that Ruman
controls, running the pilot software. Not on anyone's laptop, not in a shared
drive, not in a spreadsheet anyone can open.

**In transit:** encrypted with HTTPS. The app refuses to serve over an
unencrypted connection at all — it binds to the local machine and prints an
error rather than sending sign-in codes across the office network in the clear.

**Backups:** copies of that one file, held by Ruman, deleted when the pilot ends.

### What is not true, and why it matters that I say so

- The database file itself is **not encrypted at rest** during the pilot. Anyone
  with administrator access to that server could read it. That is one person
  today. In the organisational deployment this moves into the company's own
  Microsoft 365 tenant, where encryption at rest is the platform's job.
- The pilot has **no formal backup rotation or disaster recovery.** If the
  server is lost, recent data is lost with it. That is acceptable for a trial
  and would not be for a production system.

---

## 4. Who can see what

| | Sees |
|---|---|
| **Another colleague** | Your name, department, the rides you publish, your average rating. **Not** your contact details, unless you and they have a confirmed booking together |
| **A driver you asked** | Your name and boarding point. Your contact detail **only if they accept** |
| **The administrator (Ruman)** | Everything in the database, including the audit log. This is unavoidable: somebody has to run it |
| **The organisation** | Nothing during the pilot, unless it is formally adopted |
| **Anyone outside** | Nothing. There is no external service, no analytics, no advertising, no tracker |

**The administrator's access is the honest weak point of a pilot**, and pretending
otherwise would be worse than stating it. It is mitigated only by the fact that
every mutation is written to an audit log with actor, action and timestamp — so
administrator activity is recorded like everyone else's — and by the pilot being
short and voluntary.

---

## 5. How long it is kept

| | |
|---|---|
| Rides and bookings | **90 days**, then anonymous totals only |
| Safety incident reports | 3 years |
| Record of who changed what | 1 year |
| Your agreement to the privacy notice | While you work here, plus a year |
| **Everything, if the pilot is abandoned** | **Deleted.** The database file is destroyed and the server shut down |

---

## 6. What you can do about it

All of it yourself, from **Settings → My data**, without asking permission:

- **See** everything held about you
- **Export** it as a file
- **Correct** anything wrong
- **Delete** your data and leave
- **Withdraw** consent — your profile deactivates and no further rides generate

When you delete, ledger entries are **anonymised rather than removed**, so a
colleague's own record of a ride you shared still makes sense to them. Your name
comes off it; the fact that a ride happened does not vanish from their side.

---

## 7. The regulatory position

Built against Bangladesh's **Personal Data Protection Act 2026** from the start,
not retrofitted. A full impact assessment is in [`DPIA.md`](DPIA.md) — including
the risks that could **not** be designed away, which are listed there rather
than omitted.

Two things it does not yet have, stated plainly:

1. **The DPIA is unsigned.** It needs an organisational data protection owner and
   a legal review before this is used at scale.
2. **The pilot is not an organisational system.** It runs outside company
   infrastructure by design, so you can try it before anyone commits to it. That
   means it also sits outside the company's own security controls, monitoring and
   backup regime.

Both are reasons this is a *pilot*. If colleagues find it useful, the next step
is exactly to move it inside those controls.

---

## Answers to the questions you will actually be asked

**"Can you see where I live?"**
No. The most precise thing recorded is a neighbourhood you chose from a list —
"Uttara Diabari". There is no GPS in this app at all.

**"Can my boss see my rides?"**
They can see what any colleague sees: rides you publish, which are public to
approved colleagues by design — that is how someone finds a seat. They cannot
see your contact details, your ratings of others, or anything you have not
published.

**"What if I stop using it?"**
Delete your data from Settings → My data. It goes, immediately.

**"Who else has my phone number?"**
Only colleagues you have shared a confirmed booking with, and the app can tell
you exactly which ones and when they saw it.

**"Is this being sold or analysed by anyone?"**
No. There is no third party involved at all — no Google, no analytics, no
tracker. Nothing is sold, and there is nothing to sell it to.

**"What happens if the server is hacked?"**
An attacker with the database file would get names, work emails, journeys and any
contact details colleagues chose to enter. They would **not** get working sign-in
codes, which are hashed. This is why the pilot deliberately holds as little as it
can, and why it should not run for longer than it needs to.

**"Why should I trust this?"**
You should not have to trust it on my word. The code is readable, this document
describes what it does rather than what it aspires to, and the parts that are
weak are named above rather than left for you to discover.

---

## The one-paragraph version, for a group chat

> Ekpothe records the journeys you post as neighbourhoods, never your address,
> and there is no GPS in it. Your phone number is shown to one colleague only
> after a driver accepts you, and every time it is shown it is logged. Nothing
> goes to Google or any outside service. Only approved colleagues on our work
> email domain can get in. You can export or delete everything about yourself at
> any time, and if we drop the pilot the whole database is deleted. It runs on a
> server I control, which means I can technically see the data — so it is
> voluntary, and I would rather you knew that than found out later.
