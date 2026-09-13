import { setDefaultResultOrder } from "node:dns";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Db } from "./db.js";
import { Api, SESSION_MS, type Session } from "./api.js";
import { Access } from "./access.js";
import { signInLinkEmail, createMailer } from "./mailer.js";
import { Accounts, parseBlockedDomains } from "./accounts.js";
import { MagicLinks } from "./magic-link.js";
import { Notifier, notifications } from "./notify.js";

/*
  Prefer IPv4 when resolving hostnames.

  Node picks whatever DNS returns first, and for Google's hosts that is an IPv6
  address. Plenty of container platforms — Render's free tier among them — have
  no IPv6 route at all, so the connection fails with ENETUNREACH before a single
  byte leaves: `connect ENETUNREACH 2404:6800:4003:c06::6c:587`.

  That failure is indistinguishable from a wrong password if you only look at
  the symptom, and it silently breaks BOTH channels this app depends on — SMTP
  to Gmail and web push to Google's push service — while every setting appears
  correct. An hour of a pilot's launch went into finding it.

  This is a preference, not a restriction: a host with working IPv6 still uses
  it when there is no A record. Set PREFER_IPV6=1 on a network where the
  reverse is true.
*/
if (process.env["PREFER_IPV6"] !== "1") setDefaultResultOrder("ipv4first");

/**
 * Standalone pilot server.
 *
 * One process, one SQLite file, no runtime dependencies. It serves the built
 * app and a small JSON API, so the whole thing is `node server/index.js` behind
 * whatever host you already have.
 *
 * This exists so the product can be put in front of colleagues without waiting
 * on a SharePoint deployment. It implements the same rules as the eventual
 * SharePoint adapter because both call the same domain functions.
 */

const PORT = Number(process.env["PORT"] ?? 8080);
/**
 * Where the data lives.
 *
 * A Postgres connection string — from Neon, Supabase, or anything else that
 * speaks Postgres. There is no default: a server that quietly starts against
 * the wrong database is worse than one that refuses to start at all, and the
 * failure would not show up until a colleague's ride went missing.
 */
const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "Refusing to start: there is nowhere to keep anything.\n" +
      "  Create a free Postgres at neon.tech, then:\n" +
      "  DATABASE_URL='postgresql://...' node dist-server/server/index.js",
  );
  process.exit(1);
}
/**
 * Where the built browser app lives.
 *
 * Resolved from the working directory, not from this file. `here` moves when
 * the server is compiled — it is `server/` under tsx and `dist-server/server/`
 * once built — so a path relative to it pointed at a directory that does not
 * exist, and every page request fell through to the "not built yet" branch.
 */
const DIST = process.env["DIST_DIR"] ?? join(process.cwd(), "dist");

/**
 * TLS.
 *
 * Passphrases and session cookies travelling in clear over an office network
 * are readable by anyone else on that network, so this is not optional dressing
 * — it is the difference between a pilot and a liability.
 *
 * Two supported shapes:
 *   TLS_CERT + TLS_KEY   this process terminates TLS itself
 *   TRUST_PROXY=1        something in front already did (Caddy, nginx, a PaaS)
 *
 * With neither, the server binds to localhost only and says why. It will not
 * quietly serve an office-wide URL in the clear.
 */
const TLS_CERT = process.env["TLS_CERT"];
const TLS_KEY = process.env["TLS_KEY"];
const TRUST_PROXY = process.env["TRUST_PROXY"] === "1";
const OWN_TLS = Boolean(TLS_CERT && TLS_KEY);
const SECURE = OWN_TLS || TRUST_PROXY;

/**
 * Who may even ask for access.
 *
 * With no allowed domains the server refuses to start rather than defaulting to
 * "anyone", because the failure mode of a permissive default here is a stranger
 * inside the app and nobody noticing.
 */
/**
 * Load `.env.local` if it is there.
 *
 * Done before anything reads `process.env`, so a value set in the file behaves
 * exactly as one exported in the shell. Real environment variables win: a
 * hosting platform's settings must not be overridden by a file that happened to
 * be committed by accident.
 */
{
  const envFile = join(process.cwd(), ".env.local");
  if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envFile);
    } catch (e) {
      console.error("could not read .env.local:", e);
    }
  }
}


/** Public address of the app. It is what the sign-in link points at. */
const APP_URL = process.env["APP_URL"] ?? `http://localhost:${PORT}`;

/**
 * The first administrator.
 *
 * Their own personal address. Registering with it is approved immediately and
 * as an admin, and sign-in links are sent to it like anybody else's — so there
 * is no seeded row, and no account that exists without a way to reach it.
 */
const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "").trim().toLowerCase();
if (!ADMIN_EMAIL) {
  console.error(
    "ADMIN_EMAIL is not set.\n" +
      "Refusing to start: somebody has to be able to approve the first colleague.\n" +
      "  ADMIN_EMAIL='you@gmail.com' node dist-server/server/index.js",
  );
  process.exit(1);
}

/**
 * A first way in for the administrator, when mail is not available.
 *
 * Everybody else joins by a code the administrator mints for them. The
 * administrator has nobody to mint one for *them*, and with no working mailer
 * there is no link either — an approved account with no door, which is the same
 * lockout this pilot has now shipped twice in different disguises.
 *
 * Set it to any secret string, sign in once, and delete it. It is compared in
 * constant time and the boot banner says loudly that it is set, because a
 * standing password in an environment variable is a thing to remove rather than
 * to forget.
 */
const ADMIN_BOOTSTRAP_CODE = (process.env["ADMIN_BOOTSTRAP_CODE"] ?? "").trim();

const db = new Db(DATABASE_URL);
const api = new Api(db);
/**
 * Employer domains that may NOT be used to register.
 *
 * Blocking them is the point rather than a restriction: a work address
 * identifies a person and their employer together, which is what would make
 * this the employer's concern rather than a colleague's project.
 */
const BLOCKED_DOMAINS = parseBlockedDomains(process.env["BLOCKED_EMAIL_DOMAINS"] ?? "giz.de");

/**
 * Push keys. Generate once with:  npx web-push generate-vapid-keys
 * Without them the app still notifies by email; it simply cannot buzz a phone.
 */
const VAPID_PUBLIC = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"];

const mailer = createMailer();

/**
 * What the last check of the mail relay said.
 *
 * Held so `/api/health` can report it. The administrator of a pilot on a free
 * hosting tier may have no shell and no easy route to a log viewer, and this is
 * the failure that looks like success from every other angle: the sign-in form
 * deliberately says "a link is on its way" whether or not one was sent, so that
 * it cannot be used to discover who has registered.
 *
 * That was the right call, and it leaves the operator with nothing to go on.
 * This is the compensating instrument.
 */
type MailStatus =
  | { state: "unknown" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "broken"; error: string };

let mailStatus: MailStatus = { state: "unknown" };

/**
 * Check the relay, at most once at a time.
 *
 * The single flight matters because this instance sleeps: waking it runs the
 * boot check while the request that woke it is still in flight, and both would
 * otherwise open their own connection to the relay.
 */
let inFlight: Promise<MailStatus> | undefined;

const checkMailer = (): Promise<MailStatus> => {
  if (inFlight) return inFlight;
  mailStatus = { state: "checking" };
  inFlight = (async () => {
    if (!mailer.enabled) {
      mailStatus = { state: "broken", error: "SMTP_HOST or SMTP_FROM is not set" };
    } else {
      /*
        Bounded, because an unreachable relay can hang for a long time and this
        is called from a health endpoint. A check that never returns would make
        the host conclude the app is dead and restart it — turning a mail
        problem into an outage.
      */
      const timeout = new Promise<{ ok: false; error: string }>((res) =>
        setTimeout(() => res({ ok: false, error: "relay did not answer within 15s" }), 15_000).unref(),
      );
      const v = await Promise.race([mailer.verify(), timeout]);
      mailStatus = v.ok ? { state: "ok" } : { state: "broken", error: v.error ?? "unknown error" };
    }
    inFlight = undefined;
    return mailStatus;
  })();
  return inFlight;
};

/**
 * How to say it, without saying something untrue.
 *
 * "not checked yet" was reported as `broken`, which is a different claim from
 * the one the server could actually make and sends the reader looking for a
 * fault that may not exist. Unknown is unknown.
 */
const describeMail = (s: MailStatus): string => {
  switch (s.state) {
    case "ok": return "ok";
    case "checking": return "checking the relay — reload in a moment";
    case "broken": return `broken: ${s.error}`;
    case "unknown": return "not checked yet — add ?recheck=1 to test it now";
  }
};
const accounts = new Accounts(db, BLOCKED_DOMAINS, ADMIN_EMAIL);
const magicLinks = new MagicLinks(db);
const notifier = new Notifier(
  db,
  mailer,
  VAPID_PUBLIC && VAPID_PRIVATE
    ? {
        publicKey: VAPID_PUBLIC,
        privateKey: VAPID_PRIVATE,
        subject: process.env["VAPID_SUBJECT"] ?? `mailto:admin@${new URL(APP_URL).hostname}`,
      }
    : undefined,
  APP_URL,
);
const access = new Access(db);

/**
 * There is no seeded administrator row.
 *
 * An earlier version created one with an invite code and no password, which
 * could not sign in at all once the door asked for a password — the
 * administrator was locked out of their own pilot. Instead, registering with
 * `ADMIN_EMAIL` is approved immediately and as an admin, so the administrator
 * joins by exactly the route everybody else does.
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const cookie = (req: { headers: Record<string, string | string[] | undefined> }): string | undefined => {
  const raw = req.headers["cookie"];
  if (typeof raw !== "string") return undefined;
  return raw.split(";").map((c) => c.trim()).find((c) => c.startsWith("cp="))?.slice(3);
};

const body = async (req: NodeJS.ReadableStream): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const buf = c as Buffer;
    size += buf.length;
    // A pilot has no reason to accept a large body, and refusing one is
    // cheaper than discovering why it arrived.
    if (size > 256_000) throw new Error("body too large");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
};

/**
 * Sent on every response.
 *
 * HSTS only when TLS is actually in use: promising a browser that this origin
 * is always HTTPS, and then serving it over HTTP in development, locks the
 * developer out of their own machine.
 */
/**
 * How long a session lasts, and how it renews.
 *
 * Ninety days, rolling: every visit pushes the expiry out again. The effect is
 * that a colleague who uses the app signs in once and is never asked twice,
 * while somebody who has not opened it since the pilot began is asked for a
 * fresh link — which is exactly the right way round.
 *
 * It also bounds the cost of a lost phone: an unused session dies on its own.
 */
export const SESSION_DAYS = SESSION_MS / (24 * 3_600_000);

const sessionCookie = (token: string): string =>
  `cp=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 3600}` +
  (SECURE ? "; Secure" : "");

const securityHeaders = (): Record<string, string> => ({
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  ...(SECURE ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
});

const handler: Parameters<typeof createServer>[1] = (req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const send = (status: number, data: unknown) => {
      // Security headers come from one place, so an endpoint cannot be added
      // later that quietly omits them. The pilot serves its own app from its
      // own origin, so nothing needs cross-origin access; not granting it is
      // one fewer way in.
      res.writeHead(status, {
        ...securityHeaders(),
        "content-type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };

    try {
      if (url.pathname.startsWith("/api/")) {
        const session: Session | undefined = await api.sessionFor(cookie(req));

        // Open endpoints: asking for access, and redeeming a code.
        if (url.pathname === "/api/register" && req.method === "POST") {
          const b = await body(req);
          const email = String(b["email"] ?? "").trim().toLowerCase();
          const result = await accounts.register({
            email,
            displayName: String(b["displayName"] ?? ""),
            ...(b["officialName"] ? { officialName: String(b["officialName"]) } : {}),
            ...(b["department"] ? { department: String(b["department"]) } : {}),
            acknowledged: b["acknowledged"] === true,
          });

          // Tell the administrator somebody is waiting. Deliberately after the
          // reply is composed and never awaited into it: a mail server that is
          // slow or down must not make registration look like it failed.
          if (result.ok) {
            const admin = await db.get<{ id: string }>(
              "SELECT id FROM users WHERE role = 'admin' AND status = 'approved' ORDER BY createdAt LIMIT 1",
            );
            // Matched on email, which is unique. Matching on display name
            // would pick the wrong colleague the first time two of them share
            // a first name, which in an office of this size is a matter of
            // when rather than whether.
            const waiting = (await accounts.pending()).find((u) => u.email === email);
            if (admin && waiting) {
              void notifier
                .send(notifications.registrationReceived(admin.id, waiting.id, waiting.displayName))
                .catch(() => {});
            }
          }
          return send(200, result);
        }

        /*
          Ask for a sign-in link.

          The reply is identical whether a link was sent, the address has no
          account, the account is still waiting for approval, or somebody has
          asked five times in an hour. Saying anything more precise would turn
          this box into a way of finding out who works here.
        */
        if (url.pathname === "/api/sign-in-link" && req.method === "POST") {
          const b = await body(req);
          const asked = String(b["email"] ?? "");
          const same = {
            ok: true,
            message:
              "If that address has an approved account, a sign-in link is on its way. " +
              "It works once and lasts 20 minutes.",
          };

          const minted = await magicLinks.request(asked);
          if (minted) {
            const mail = signInLinkEmail(`${APP_URL}/enter?t=${encodeURIComponent(minted.token)}`);
            // Not awaited into the reply: a slow relay must not make the form
            // look broken, and the answer is the same either way.
            void mailer.send(minted.email, mail.subject, mail.text, mail.html).catch(() => {});
          }
          return send(200, same);
        }

        /*
          Redeem one. A POST on purpose.

          Mail scanners and link previewers follow GETs, and a link consumed by
          a scanner before the colleague taps it is a colleague who cannot get
          in. They do not run JavaScript, so redemption happening in a POST the
          page makes on arrival is what keeps the link alive for its owner.
        */
        if (url.pathname === "/api/session-from-link" && req.method === "POST") {
          const b = await body(req);
          const userId = await magicLinks.redeem(String(b["token"] ?? ""));
          if (!userId) {
            return send(401, {
              error:
                "That link has expired or has already been used. " +
                "Ask for a new one — it takes a moment.",
            });
          }
          const token = await api.createSession(userId);
          res.setHeader("set-cookie", sessionCookie(token));
          return send(200, await api.sessionFor(token));
        }

        // Told to the sign-in screen so the browser can subscribe to push. The
        // public key is public by design.
        /*
          Health, for the host's checker.

          It touches the database rather than just returning 200, because the
          failure worth catching is exactly the one a plain "the process is
          alive" check misses: a server running against a volume that did not
          mount, or a schema that never reached the container. Both start
          cleanly and fail on the first real request.

          Deliberately open — a checker has no cookie — and it says nothing
          about who is registered.
        */
        if (url.pathname === "/api/health") {
          /*
            Says which of the two things that can be silently broken is broken.

            Deliberately open, because a health checker carries no cookie, and
            deliberately vague: whether mail is configured, and the connection
            error when it is not, tell an outsider nothing about who has
            registered. `?recheck=1` re-tests the relay, so a corrected password
            can be confirmed without waiting out a redeploy.
          */
          try {
            await db.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
          } catch (e) {
            console.error("health check failed:", e);
            return send(503, { ok: false, database: "unreachable" });
          }
          if (url.searchParams.get("recheck") === "1") {
            await checkMailer();
          } else if (mailStatus.state === "unknown") {
            // Start it, but do not wait: the host's own health check calls this
            // endpoint and must stay fast.
            void checkMailer();
          }
          /*
            The last send failure is reported separately from the relay check.

            They fail for different reasons and only one of them is visible to
            `verify()`. A key can be perfectly valid while every send is refused
            because the sender address was never verified — the check passes,
            the app looks healthy, and nothing arrives. Saying both means the
            administrator sees the actual obstacle rather than a clean bill of
            health and an empty inbox.
          */
          const lastSend = mailer.lastSendError();
          return send(200, {
            ok: true,
            database: "ok",
            // The reason is included because "broken" on its own sends the
            // operator back to the logs this endpoint exists to replace.
            email: describeMail(mailStatus),
            ...(lastSend ? { lastEmailFailure: lastSend } : {}),
            push: notifier.canPush ? "on" : "off",
          });
        }

        if (url.pathname === "/api/config") {
          return send(200, {
            selfRegister: true,
            pushKey: VAPID_PUBLIC ?? null,
            blockedDomains: BLOCKED_DOMAINS,
            /*
              Whether the door marked "email me a sign-in link" can actually
              open.

              The app offered it unconditionally, and the reply to asking for a
              link is deliberately the same whether one was sent or not — so
              that the form cannot be used to find out who has registered. With
              no mailer that combination is a trap: the first screen a colleague
              sees is a box asking for an address, it tells them a link is on
              its way, and nothing ever arrives. They have no way to tell that
              from a slow mail server, and no reason to look for the code door
              further down.

              So the client is told, and hides the door rather than furnishing a
              lie. A relay that is configured but answering "broken" counts as
              no relay: a door that is shut is worse than no door at all.
            */
            signInByEmail: mailer.enabled && mailStatus.state !== "broken",
          });
        }

        if (url.pathname === "/api/sign-in" && req.method === "POST") {
          const b = await body(req);
          /*
            Trimmed. A phone keyboard that appends a space after a long code
            changes its length, and length is what decides whether the
            administrator's code is even compared — so an invisible character
            was enough to make the one guaranteed door report "not valid".
          */
          const code = String(b["code"] ?? "").trim();

          // The administrator's own first way in. Checked before the invite
          // codes so that it works even when none has ever been minted.
          if (ADMIN_BOOTSTRAP_CODE) {
            const given = Buffer.from(code);
            const want = Buffer.from(ADMIN_BOOTSTRAP_CODE);
            /*
              Byte lengths, not string lengths. timingSafeEqual throws on a
              length mismatch, and one non-ASCII character makes a string of the
              right length into a buffer of the wrong one — turning a wrong code
              into a 500 rather than a refusal.
            */
            if (given.length === want.length && timingSafeEqual(given, want)) {
              const admin = await db.get<{ id: string }>(
                "SELECT id FROM users WHERE email = ? AND role = 'admin'",
                ADMIN_EMAIL,
              );
              if (!admin) {
                /*
                  Machine-readable, because the app is bilingual and this is the
                  one refusal that carries an instruction rather than a refusal.
                  It leaks nothing: it is only ever reached by somebody who
                  already holds the bootstrap code.
                */
                return send(401, {
                  reason: "no-admin-account",
                  error:
                    "Register with ADMIN_EMAIL first, then use this code to sign in.",
                });
              }
              await db.audit(admin.id, "user", admin.id, "bootstrap-sign-in");
              const token = await api.createSession(admin.id);
              res.setHeader("set-cookie", sessionCookie(token));
              return send(200, await api.sessionFor(token));
            }
          }
          // The code alone identifies the person: it was minted for exactly one
          // of them, so no address is needed or wanted — which is the point,
          // since an invited colleague may not have a usable one.
          const userId = await access.redeemByCode(code, String(b["displayName"] ?? ""));
          // One message for every failure. Distinguishing "not approved" from
          // "wrong code" would turn this into a way of finding out who works here.
          if (!userId) {
            return send(401, {
              error: "That code is not valid. Ask the administrator for a new one.",
            });
          }
          const token = await api.createSession(userId);
          res.setHeader("set-cookie", sessionCookie(token));
          return send(200, await api.sessionFor(token));
        }

        if (url.pathname === "/api/me") {
          if (!session) return send(401, { error: "Not signed in." });
          // Whether a contact detail is on file, never the detail itself. The
          // app needs to know to ask for one; nothing needs it echoed back on
          // every page load.
          const row = await db.get<{ contactValue: string | null }>(
            "SELECT contactValue FROM users WHERE id = ?",
            session.userId,
          );
          return send(200, { ...session, hasContact: Boolean(row?.contactValue) });
        }

        if (!session) return send(401, { error: "Not signed in." });

        if (url.pathname === "/api/pending-requests" && req.method === "GET") {
          return send(200, { requests: await api.pendingForDriver(session.userId) });
        }
        /*
          "I looked for a place and it is not there."

          Recorded rather than acted on. The place list stays a closed set,
          because free text is what produced four spellings of one destination
          in the legacy workbook and because matching cannot run over prose —
          but a closed set nobody can add to is a closed door, and "no place by
          that name" used to be the end of the road for anybody who lives
          somewhere it does not list.
        */
        if (url.pathname === "/api/place-requests" && req.method === "POST") {
          const b = await body(req);
          const text = String(b["text"] ?? "").trim().slice(0, 120);
          // Two characters is a typo, not a place. Silently accepted either way:
          // the colleague has already been told the app does not know it, and a
          // second refusal would say only that their request was refused too.
          if (text.length >= 3) {
            await db.run(
              "INSERT INTO place_requests (id, text, askedBy, askedAt) VALUES (?, ?, ?, ?)",
              randomUUID(),
              text,
              session.userId,
              new Date().toISOString(),
            );
          }
          return send(200, { ok: true });
        }

        if (url.pathname === "/api/people" && req.method === "GET") {
          return send(200, { people: await api.listPeople() });
        }
        if (url.pathname === "/api/rides" && req.method === "GET") {
          return send(200, { rides: await api.listRides() });
        }
        if (url.pathname === "/api/rides" && req.method === "POST") {
          const b = await body(req);
          const out = await api.publishRide(session, b as never, Number(b["cap"] ?? 1e9));
          return out.ok ? send(201, out.ride) : send(400, { error: out.error });
        }
        if (url.pathname === "/api/bookings" && req.method === "GET") {
          return send(200, { bookings: await api.listBookingsForRider(session.userId) });
        }
        if (url.pathname === "/api/bookings" && req.method === "POST") {
          const out = await api.requestSeat(session, (await body(req)) as never);
          if (!out.ok) return send(409, { error: out.error, code: out.code });

          // The reason this product exists. Without it the driver finds out
          // only if they happen to open the app, which is exactly how the
          // spreadsheet failed.
          const ride = await api.getRide(out.booking.rideId);
          if (ride) {
            void notifier.send(
              notifications.seatRequested(
                ride.driverId,
                out.booking.id,
                session.displayName,
                out.booking.boardZoneId,
                ride.departureAt.slice(11, 16),
              ),
            );
          }
          return send(201, out.booking);
        }

        if (url.pathname === "/api/bookings/accept" && req.method === "POST") {
          const b = await body(req);
          const out = await api.acceptBooking(String(b["bookingId"] ?? ""), session.userId);
          if (!out.ok) return send(400, { error: out.error.message });
          const ride = await api.getRide(out.value.rideId);
          if (ride) {
            void notifier.send(
              notifications.seatAccepted(
                out.value.riderId,
                out.value.id,
                session.displayName,
                ride.departureAt.slice(11, 16),
              ),
            );
          }
          return send(200, out.value);
        }

        if (url.pathname === "/api/bookings/decline" && req.method === "POST") {
          const b = await body(req);
          const out = await api.declineBooking(String(b["bookingId"] ?? ""), session.userId);
          if (!out.ok) return send(400, { error: out.error.message });
          const ride = await api.getRide(out.value.rideId);
          if (ride) {
            // Never says who declined, or why.
            void notifier.send(
              notifications.seatDeclined(
                out.value.riderId,
                out.value.id,
                ride.departureAt.slice(11, 16),
              ),
            );
          }
          return send(200, { ok: true });
        }
        if (url.pathname === "/api/complete" && req.method === "POST") {
          const b = await body(req);
          const out = await api.completeTrip(session, String(b["bookingId"] ?? ""));
          return out.ok ? send(200, { ok: true }) : send(400, { error: out.error });
        }
        if (url.pathname === "/api/zero-result" && req.method === "POST") {
          await api.recordZeroResult(session, (await body(req)) as never);
          return send(204, null);
        }
        if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
          const b = (await body(req)) as unknown as {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
          };
          if (!b.endpoint || !b.keys?.p256dh || !b.keys.auth) {
            return send(400, { error: "Incomplete subscription." });
          }
          await notifier.subscribe(session.userId, {
            endpoint: b.endpoint,
            keys: { p256dh: b.keys.p256dh, auth: b.keys.auth },
          });
          return send(200, { ok: true });
        }
        if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
          const b = await body(req);
          await db.run("DELETE FROM push_subscriptions WHERE endpoint = ? AND userId = ?",
            String(b["endpoint"] ?? ""), session.userId);
          return send(200, { ok: true });
        }

        if (url.pathname === "/api/contact" && req.method === "PUT") {
          const b = await body(req);
          await api.setContact(session.userId, String(b["kind"] ?? "phone"), String(b["value"] ?? ""));
          return send(200, { ok: true });
        }
        if (url.pathname === "/api/contact" && req.method === "POST") {
          const b = await body(req);
          const revealed = await api.revealContact(session, String(b["bookingId"] ?? ""));
          return revealed
            ? send(200, revealed)
            : send(403, { error: "Contact details are shared once a driver accepts." });
        }

        // Admin only, checked on the server. A client cannot ask its way in.
        if (url.pathname.startsWith("/api/admin/")) {
          if (session.role !== "admin") return send(403, { error: "Not an administrator." });
          if (url.pathname === "/api/admin/pending" && req.method === "GET") {
            // From accounts, so the administrator sees the optional official
            // name and department a colleague gave them to be recognised by.
            return send(200, { pending: await accounts.pending() });
          }
          if (url.pathname === "/api/admin/approve" && req.method === "POST") {
            const b = await body(req);
            const userId = String(b["userId"] ?? "");
            const issued = await access.approve(userId, session.userId);
            if (!issued) return send(404, { error: "No such request." });
            // Told by email as well, when email works at all. It is a bonus
            // rather than the mechanism: the administrator has the code on
            // screen and can pass it on without anybody's mail server.
            if (mailer.enabled) {
              void notifier.send(notifications.registrationApproved(userId)).catch(() => {});
            }
            return send(200, issued);
          }
          if (url.pathname === "/api/admin/invite" && req.method === "POST") {
            const b = await body(req);
            return send(200, await access.invite(String(b["displayName"] ?? ""), session.userId));
          }
          /*
            A fresh code for somebody already in.

            The way back for a colleague who has lost their access rather than
            their approval — a cleared browser, a new phone, a session that
            reached ninety days. Until this existed there was none, because a
            code is single-use and the other door needs a mail provider this
            pilot has repeatedly not had.

            Offered for the administrator's own row too. They are the one person
            with nobody to ask, and a spare key minted before they need it is
            the difference between moving to a new phone and going back to the
            environment variables.
          */
          if (url.pathname === "/api/admin/reissue" && req.method === "POST") {
            const b = await body(req);
            const issued = await access.reissue(String(b["userId"] ?? ""), session.userId);
            // One reply for "no such person" and "not somebody who can hold a
            // code" alike: a pending colleague is approved rather than
            // reissued, and a suspended one is not handed a working code by a
            // button labelled as a convenience.
            if (!issued) return send(404, { error: "Nobody here can be given a code." });
            return send(200, issued);
          }
          if (url.pathname === "/api/admin/place-requests" && req.method === "GET") {
            /*
              Grouped, and counted. Three colleagues asking for the same place is
              a different fact from one colleague asking three times, and the
              administrator deciding whether to add it needs to tell them apart.
            */
            const rows = await db.all<{ text: string; asks: string; people: string; last: string }>(
              `SELECT text,
                      COUNT(*)              AS asks,
                      COUNT(DISTINCT askedBy) AS people,
                      MAX(askedAt)          AS last
                 FROM place_requests
                WHERE handledAt IS NULL
                GROUP BY text
                ORDER BY COUNT(DISTINCT askedBy) DESC, MAX(askedAt) DESC
                LIMIT 50`,
            );
            return send(200, {
              requests: rows.map((r) => ({
                text: r.text,
                asks: Number(r.asks),
                people: Number(r.people),
                last: r.last,
              })),
            });
          }
          if (url.pathname === "/api/admin/place-requests/handled" && req.method === "POST") {
            const b = await body(req);
            const text = String(b["text"] ?? "");
            // By text rather than by row: the administrator is dismissing the
            // request, and every colleague who asked for that place asked for
            // the same thing.
            await db.run(
              "UPDATE place_requests SET handledAt = ? WHERE text = ? AND handledAt IS NULL",
              new Date().toISOString(),
              text,
            );
            return send(200, { ok: true });
          }
          if (url.pathname === "/api/admin/suspend" && req.method === "POST") {
            const b = await body(req);
            await access.suspend(String(b["userId"] ?? ""), session.userId);
            return send(200, { ok: true });
          }
        }
        return send(404, { error: "No such endpoint." });
      }

      // --- static app ---------------------------------------------------
      if (!existsSync(DIST)) {
        res.writeHead(503, {
          ...securityHeaders(),
          "content-type": "text/plain; charset=utf-8",
        });
        return res.end(`The app has not been built yet.\nRun: npm run build\nLooked in: ${DIST}`);
      }
      // normalize() before joining, so "../" in a request cannot escape dist/.
      const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
      let file = join(DIST, rel);
      if (!file.startsWith(DIST) || !existsSync(file) || rel === "/") file = join(DIST, "index.html");
      res.writeHead(200, {
        ...securityHeaders(),
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
      });
      return res.end(readFileSync(file));
    } catch (e) {
      // Never leak an internal message to a client. The log is where detail goes.
      console.error("request failed:", e);
      if (!res.headersSent) send(500, { error: "Something went wrong." });
      else res.end();
    }
  })();
};

/**
 * The database, named without its password.
 *
 * The connection string carries credentials, and a startup banner is the single
 * most-screenshotted, most-pasted-into-chat piece of output this app produces.
 */
const describeDb = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
};

const server = OWN_TLS
  ? createSecureServer({ cert: readFileSync(TLS_CERT!), key: readFileSync(TLS_KEY!) }, handler)
  : createServer(handler);

// Without TLS, bind to loopback only. A pilot reachable across the office in
// the clear is worse than a pilot nobody can reach, because the second failure
// is visible and the first is not.
/**
 * Which interface to listen on.
 *
 * Without TLS, loopback only — a pilot reachable across the office in the clear
 * is worse than one nobody can reach, because the second failure is visible and
 * the first is not.
 *
 * With TLS terminated upstream the default opens up, because on a platform like
 * Fly the proxy reaches the process over a private network. That default is
 * wrong when the proxy is on this same machine — Tailscale Funnel and Caddy
 * both connect to localhost — and binding every interface there would also
 * publish the app in plaintext to everyone on the office LAN, next to the
 * HTTPS address colleagues were given. `BIND_HOST=127.0.0.1` is how that is
 * said explicitly.
 */
const HOST = process.env["BIND_HOST"] ?? (SECURE ? "0.0.0.0" : "127.0.0.1");

/**
 * The T−45min reconfirm, and nothing else on a timer.
 *
 * No-shows are the highest-frequency failure in commute carpooling: a driver
 * who waits at a pickup point for somebody who never comes does not offer a
 * seat again. A single check every five minutes is enough — `Notifier.send`
 * refuses to send a notification whose id it has already recorded, so an
 * overlapping run or a restart cannot buzz the same phone twice.
 */
const RECONFIRM_WINDOW_MS = 45 * 60_000;
const SCHEDULER_TICK_MS = 5 * 60_000;

/**
 * How long after departure a trip is taken to have happened.
 *
 * The driver's tap is a confirmation, not a gate. The alternative — a trip that
 * stays open until somebody remembers to close it, blocking the next posting —
 * punishes a driver for forgetting a piece of housekeeping by stopping the app
 * working for them. Drivers are the scarce side of this: one blocked driver is
 * two or three colleagues without a ride, which is the most damaging failure
 * available. Plenty of people also post morning and evening, and would have to
 * close the morning trip while driving it.
 *
 * Four hours covers a Dhaka commute and any plausible delay, and lands well
 * before anybody would be posting the next day's ride.
 */
const AUTO_COMPLETE_AFTER_MS = 4 * 3_600_000;

const runReconfirmSweep = async (): Promise<void> => {
  try {
    const now = Date.now();
    const soon = new Date(now + RECONFIRM_WINDOW_MS).toISOString();
    const nowIso = new Date(now).toISOString();

    const due = await db.all<{
      rideId: string;
      driverId: string;
      riderId: string;
      driverName: string;
      riderName: string;
      departureAt: string;
    }>(
      `SELECT r.id AS rideId, r.driverId, b.riderId,
              d.displayName AS driverName, p.displayName AS riderName,
              r.departureAt
         FROM bookings b
         JOIN rides r ON r.id = b.rideId
         JOIN users d ON d.id = r.driverId
         JOIN users p ON p.id = b.riderId
        WHERE b.status = 'confirmed'
          AND r.status IN ('published', 'full')
          AND r.departureAt > ? AND r.departureAt <= ?`,
      nowIso,
      soon,
    );

    for (const row of due) {
      const time = row.departureAt.slice(11, 16);
      // Both sides: each needs to know the other is still coming.
      void notifier.send(notifications.reconfirm(row.driverId, row.rideId, row.riderName, time));
      void notifier.send(notifications.reconfirm(row.riderId, row.rideId, row.driverName, time));
    }
  } catch (e) {
    // A failing sweep must never take the server down with it.
    console.error("reconfirm sweep failed:", e);
  }
};

/**
 * Close out trips whose departure is well past.
 *
 * Completed trips is the number that says whether the pilot worked, so it must
 * not depend on remembering to tap something after arriving at work. Asking is
 * still worth doing — the notification below does that, and a colleague who
 * answers "no" is the signal worth having — but the count does not wait on it.
 */
const runAutoCompleteSweep = async (): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - AUTO_COMPLETE_AFTER_MS).toISOString();
    const due = await db.all<{
      id: string;
      rideId: string;
      driverId: string;
      riderId: string;
      driverName: string;
      riderName: string;
      departureAt: string;
    }>(
      `SELECT b.id, b.rideId, r.driverId, b.riderId,
              d.displayName AS driverName, p.displayName AS riderName,
              r.departureAt
         FROM bookings b
         JOIN rides r ON r.id = b.rideId
         JOIN users d ON d.id = r.driverId
         JOIN users p ON p.id = b.riderId
        WHERE b.status = 'confirmed' AND r.departureAt < ?`,
      cutoff,
    );
    for (const row of due) {
      await db.run(
        "UPDATE bookings SET status = 'completed', rowVersion = rowVersion + 1 WHERE id = ? AND status = 'confirmed'",
        row.id,
      );
      // Ask both sides whether it actually happened. The trip is closed either
      // way; this is how a no-show becomes visible, and a no-show is the thing
      // that stops a driver offering a seat again.
      const time = row.departureAt.slice(11, 16);
      void notifier
        .send(notifications.didItHappen(row.driverId, row.rideId, row.riderName, time))
        .catch(() => {});
      void notifier
        .send(notifications.didItHappen(row.riderId, row.rideId, row.driverName, time))
        .catch(() => {});
      await db.run(
        "UPDATE rides SET status = 'completed', rowVersion = rowVersion + 1 WHERE id = ? AND status IN ('published','full')",
        row.rideId,
      );
      await db.audit("system", "booking", row.id, "auto-complete");
    }
    if (due.length > 0) console.log(`auto-completed ${due.length} trip(s)`);
  } catch (e) {
    console.error("auto-complete sweep failed:", e);
  }
};

setInterval(() => void runReconfirmSweep(), SCHEDULER_TICK_MS).unref();
setInterval(() => void runAutoCompleteSweep(), SCHEDULER_TICK_MS).unref();


/*
  Migrate before listening, not alongside it.

  Starting the listener first would accept a colleague's request in the window
  before the tables exist, and answer it with an error that looks like a bug in
  the app rather than a server that is not ready yet.
*/
await db.migrate();

// Once the tables exist, and only then: a server that was down over the evening
// should not wait five minutes to notice that yesterday's trips are over. This
// used to run before the migration and failed on every boot against a database
// that had not been set up yet.
await runAutoCompleteSweep();

server.listen(PORT, HOST, () => {
  const scheme = OWN_TLS ? "https" : "http";
  console.log(`Ekpothe — pilot server`);
  console.log(`  ${scheme}://${HOST === "0.0.0.0" ? "0.0.0.0" : HOST}:${PORT}`);
  console.log(`  database:   ${describeDb(DATABASE_URL)}`);
  /*
    Reported per channel, not as one verdict.

    An earlier version printed "push + email" whenever push keys were present,
    which is how an administrator ends up believing approval mail goes out when
    no mailer is configured at all. The colleague waiting to be let in is the
    one who pays for that.
  */
  console.log(
    `  push:       ${notifier.canPush ? "on" : "OFF — set VAPID keys to reach phones"}`,
  );
  if (!mailer.enabled) {
    console.log("  email:      OFF — set SMTP_* or nobody is told they were approved");
    if (!notifier.canPush) {
      console.log("  WARNING: no way to reach anybody who is not looking at the app.");
    }
  } else {
    // Checked rather than assumed, and printed when the answer arrives. Boot is
    // not held up for a relay that may be slow, but the truth still lands in
    // the same place the administrator is already looking.
    console.log("  email:      settings present — checking the relay…");
    void checkMailer().then((v) => {
      console.log(
        v.state === "ok"
          ? "  email:      relay reachable and accepted the login"
          : `  email:      ${describeMail(v).toUpperCase()}\n              Approval mail will not arrive. See docs/EMAIL_SETUP.md`,
      );
    });
  }
  console.log(
    `  joining:    colleagues register themselves, ${BLOCKED_DOMAINS.map((d) => `@${d}`).join(", ")} refused; you approve`,
  );
  if (ADMIN_BOOTSTRAP_CODE) {
    console.log("");
    console.log("  ADMIN_BOOTSTRAP_CODE is set. It signs you in as the administrator.");
    /*
      Six characters is the one length that cannot work reliably.

      The code box folds a six-character entry to upper case, because that is
      the shape of a colleague's invite code and folding lets them type theirs
      however they like. A six-character bootstrap code containing a lower-case
      letter is therefore transformed on its way here and refused — which is
      precisely the silent lockout this code exists to prevent, and it is not
      the kind of thing anybody guesses from "that code is not valid".
    */
    if (ADMIN_BOOTSTRAP_CODE.length === 6 && /[a-z]/.test(ADMIN_BOOTSTRAP_CODE)) {
      console.log(
        "  WARNING: it is six characters and contains a lower-case letter, which\n" +
          "           the code box will fold to upper case. Use a longer code, or an\n" +
          "           upper-case one, or you will not be able to sign in with it.",
      );
    }
    console.log("  Use it once, then delete it from the environment.");
  }
  if (OWN_TLS) {
    console.log(`  TLS:        this process, from TLS_CERT and TLS_KEY`);
  } else if (TRUST_PROXY) {
    console.log(`  TLS:        terminated upstream (TRUST_PROXY=1), listening on ${HOST}`);
  } else {
    console.log("");
    console.log("  NOT SERVING TO THE NETWORK — no TLS configured.");
    console.log("  Bound to 127.0.0.1 so nothing leaves this machine in the clear.");
    console.log("  Before inviting colleagues, do one of:");
    console.log("    TLS_CERT=/path/fullchain.pem TLS_KEY=/path/privkey.pem  (this process)");
    console.log("    TRUST_PROXY=1                                          (Caddy/nginx in front)");
    console.log("  See server/README.md — the Caddyfile there is two lines.");
  }
});

/**
 * A plain-HTTP listener whose only job is to send people to HTTPS.
 *
 * Colleagues will type the bare hostname. Without this they get a connection
 * refused and conclude the tool is broken.
 */
if (OWN_TLS && process.env["REDIRECT_PORT"]) {
  const redirectPort = Number(process.env["REDIRECT_PORT"]);
  createServer((req, res) => {
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    res.writeHead(301, { location: `https://${host}:${PORT}${req.url ?? "/"}` });
    res.end();
  }).listen(redirectPort, HOST, () => {
    console.log(`  redirect:   http://:${redirectPort} → https://:${PORT}`);
  });
}
