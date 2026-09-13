# Running Ekpothe

How to get in, how colleagues get in, and what to do when somebody cannot.

For getting the app deployed in the first place, see `DEPLOY.md`. This is the
document for the day after that.

---

## The short version

There are no passwords in this app, and there is no working email. Access is a
**six-character code** that you issue and pass on however you already talk to
that colleague. A code works **once** and lasts **seven days**. After somebody
redeems one, their session lasts **ninety days and restarts on every visit**, so
a colleague who uses the app at all is never asked to sign in again.

You cannot look a code up later. Only a hash of it is stored, so a copy of the
whole database hands nobody a way in — and that includes you. **Copy a code
before you leave the screen it appears on.** When somebody loses theirs, you
issue a new one; you never retrieve the old one.

---

## 1. Signing in as the administrator

### The first time, once ever

`ADMIN_BOOTSTRAP_CODE` signs you **in to** the administrator account. It does not
**create** one. So the order matters, and getting it the wrong way round is the
most common way to conclude the app is broken when it is not.

1. Open the app's URL.
2. Tap **I need an account**.
3. Enter the address you set as `ADMIN_EMAIL` — it must match exactly.
4. Enter your name, tick the confirmation box, press **Create an account**.
   You are approved immediately and as an administrator, because the address
   matches. Nobody has to approve you.
5. The app returns you to the code screen. Enter `ADMIN_BOOTSTRAP_CODE` exactly
   as you set it in the host's environment. **It is case-sensitive.**
6. You are in, and an **Admin** tab appears along the bottom.

### Every time after that

You do not. Your session lasts ninety days and the clock restarts every time you
open the app, so ordinary use never signs you out.

You only need to do something when you are on a **different** device:

| Situation | What to do |
|---|---|
| Still signed in on your phone | Admin → your own row → **Code for me** → type that code on the other device |
| Locked out entirely (phone lost or stolen) | Enter `ADMIN_BOOTSTRAP_CODE` again |

**Keep `ADMIN_BOOTSTRAP_CODE` set.** It is the only route into the administrator
account that never expires. It is a standing password and that is what it is
for: anybody who can read it can already read `DATABASE_URL` from the same page,
so it grants nothing the host's own login did not.

Write it down somewhere that is **not** your phone. If you lose the phone you may
also lose the authenticator you sign in to the host with, and that is the one
situation with no way back.

---

## 2. What a colleague does

You send them the URL. Nothing else is needed from you yet.

1. They open it and see the "not an official system" notice and a box marked
   **Your code**.
2. They have no code, so they tap **I need an account**.
3. They enter a **personal** email address. A work address is refused, with the
   reason — that refusal is deliberate and is what keeps the employer's data out
   of this.
4. Their name, tick the confirmation box, **Create an account**.
5. They see: *"Thanks — your registration is with the administrator. You'll be
   able to sign in once it's approved."* Then they wait for you.
6. You approve and send the code. They open the link again, enter it, and they
   are in for the next ninety days.

**You are notified the moment somebody registers** — a push notification, if you
allowed them when the app asked. Push does not depend on email.

### The other way in

For a colleague who has no personal address they would rather give, or shares a
phone: Admin → **Invite a colleague** → type a name you recognise → **Create a
code**. That makes the account and the code in one step, and they skip
registration entirely.

---

## 3. Approving, and issuing codes

### Approving somebody

Admin → **Waiting for approval**, at the top of the screen. You see the name they
gave, plus their official name and department if they chose to add them. You are
approving on recognition — if you do not recognise the name, ask before you
approve.

Press **Approve — [name]**. A green panel appears with the code and a **Copy
message** button, which puts the whole instruction on your clipboard in whichever
language the app is set to:

> You're in on Ekpothe. Open https://your-app.example, tap "I have a code" and
> enter: K7PQ2M

Paste that into WhatsApp and you are done.

### When somebody cannot get in

This is routine, not a fault. A code works once, so the second time a colleague
needs one is normal: a new phone, a cleared browser, a code that expired before
they used it, or a forgotten message.

Admin → **Colleagues who are in** → their row → **New code**.

It takes a few seconds and you can do it as often as you like.

**One consequence to know:** issuing a new code kills the one they were holding.
If you sent a code on Sunday and press **New code** on Monday, the Sunday code
stops working. So do not press it "just in case" while a colleague is still
hunting for the code you already sent — you would be invalidating the very thing
they are about to type.

### Your own row

Your row has the same button, labelled **Code for me**. It is for signing in on a
second device this week. It expires in seven days like any other, so it is not a
key to keep in a drawer. The key you keep is `ADMIN_BOOTSTRAP_CODE`.

### Removing somebody

**Remove**, on their row. It suspends the account, ends their session
immediately, and kills any code they are holding. It is not offered on your own
row: removing yourself would leave the pilot with nobody who can approve anybody.

---

## Quick reference

| | |
|---|---|
| Code | Six characters. No O/0 or I/1, so it survives being read aloud |
| Case | Does not matter for a colleague's code. Does matter for `ADMIN_BOOTSTRAP_CODE` |
| Valid | Seven days, one use |
| Can you look it up later | **No.** Copy it before leaving the screen |
| Can you issue another | Yes, any time, from the member's row |
| Session | Ninety days, clock restarts on every visit |
| Notified when somebody registers | Yes, by push, if you allowed notifications |

---

## When something looks wrong

**`https://your-app.example/api/health`** answers in plain JSON:

```json
{"ok":true,"database":"ok","email":"OFF — ...","push":"on"}
```

- `database` anything but `ok` is the only real emergency. Check `DATABASE_URL`.
- `email` saying `OFF` is **correct** — the app does not use email. `BROKEN`
  means an `SMTP_*` variable is still set and should be deleted.
- `push` saying `off` means the `VAPID_*` keys are missing, so nobody gets
  notifications. The app still works; you simply have to be told when somebody
  is waiting rather than notified.

**The first request after a quiet spell is slow.** On a free host the app sleeps
after fifteen minutes of no traffic and takes about thirty seconds to wake. It is
not broken; it is asleep. See `DEPLOY.md` for the keep-awake ping.

**Never regenerate the `VAPID_*` keys.** Every phone that has subscribed to
notifications is tied to the existing pair. New keys silently kill every
subscription, with no error anywhere and no way to tell from inside the app.
