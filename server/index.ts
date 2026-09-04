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
const DB_PATH = process.env["DB_PATH"] ?? join(process.cwd(), "carpool.db");
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

const db = new Db(DB_PATH);
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
        const session: Session | undefined = api.sessionFor(cookie(req));

        // Open endpoints: asking for access, and redeeming a code.
        if (url.pathname === "/api/register" && req.method === "POST") {
          const b = await body(req);
          const email = String(b["email"] ?? "").trim().toLowerCase();
          const result = accounts.register({
            email,
            displayName: String(b["displayName"] ?? ""),
            ...(b["officialName"] ? { officialName: String(b["officialName"]) } : {}),
            ...(b["department"] ? { department: String(b["department"]) } : {}),
          });

          // Tell the administrator somebody is waiting. Deliberately after the
          // reply is composed and never awaited into it: a mail server that is
          // slow or down must not make registration look like it failed.
          if (result.ok) {
            const admin = db.get<{ id: string }>(
              "SELECT id FROM users WHERE role = 'admin' AND status = 'approved' ORDER BY createdAt LIMIT 1",
            );
            // Matched on email, which is unique. Matching on display name
            // would pick the wrong colleague the first time two of them share
            // a first name, which in an office of this size is a matter of
            // when rather than whether.
            const waiting = accounts.pending().find((u) => u.email === email);
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

          const minted = magicLinks.request(asked);
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
          const userId = magicLinks.redeem(String(b["token"] ?? ""));
          if (!userId) {
            return send(401, {
              error:
                "That link has expired or has already been used. " +
                "Ask for a new one — it takes a moment.",
            });
          }
          const token = api.createSession(userId);
          res.setHeader("set-cookie", sessionCookie(token));
          return send(200, api.sessionFor(token));
        }

        // Told to the sign-in screen so the browser can subscribe to push. The
        // public key is public by design.
        if (url.pathname === "/api/config") {
          return send(200, {
            selfRegister: true,
            pushKey: VAPID_PUBLIC ?? null,
            blockedDomains: BLOCKED_DOMAINS,
          });
        }

        if (url.pathname === "/api/sign-in" && req.method === "POST") {
          const b = await body(req);
          const code = String(b["code"] ?? "");
          // The code alone identifies the person: it was minted for exactly one
          // of them, so no address is needed or wanted — which is the point,
          // since an invited colleague may not have a usable one.
          const userId = access.redeemByCode(code, String(b["displayName"] ?? ""));
          // One message for every failure. Distinguishing "not approved" from
          // "wrong code" would turn this into a way of finding out who works here.
          if (!userId) {
            return send(401, {
              error: "That code is not valid. Ask the administrator for a new one.",
            });
          }
          const token = api.createSession(userId);
          res.setHeader("set-cookie", sessionCookie(token));
          return send(200, api.sessionFor(token));
        }

        if (url.pathname === "/api/me") {
          if (!session) return send(401, { error: "Not signed in." });
          // Whether a contact detail is on file, never the detail itself. The
          // app needs to know to ask for one; nothing needs it echoed back on
          // every page load.
          const row = db.get<{ contactValue: string | null }>(
            "SELECT contactValue FROM users WHERE id = ?",
            session.userId,
          );
          return send(200, { ...session, hasContact: Boolean(row?.contactValue) });
        }

        if (!session) return send(401, { error: "Not signed in." });

        if (url.pathname === "/api/pending-requests" && req.method === "GET") {
          return send(200, { requests: api.pendingForDriver(session.userId) });
        }
        if (url.pathname === "/api/people" && req.method === "GET") {
          return send(200, { people: api.listPeople() });
        }
        if (url.pathname === "/api/rides" && req.method === "GET") {
          return send(200, { rides: api.listRides() });
        }
        if (url.pathname === "/api/rides" && req.method === "POST") {
          const b = await body(req);
          const out = api.publishRide(session, b as never, Number(b["cap"] ?? 1e9));
          return out.ok ? send(201, out.ride) : send(400, { error: out.error });
        }
        if (url.pathname === "/api/bookings" && req.method === "GET") {
          return send(200, { bookings: api.listBookingsForRider(session.userId) });
        }
        if (url.pathname === "/api/bookings" && req.method === "POST") {
          const out = api.requestSeat(session, (await body(req)) as never);
          if (!out.ok) return send(409, { error: out.error, code: out.code });

          // The reason this product exists. Without it the driver finds out
          // only if they happen to open the app, which is exactly how the
          // spreadsheet failed.
          const ride = api.getRide(out.booking.rideId);
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
          const ride = api.getRide(out.value.rideId);
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
          const ride = api.getRide(out.value.rideId);
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
          const out = api.completeTrip(session, String(b["bookingId"] ?? ""));
          return out.ok ? send(200, { ok: true }) : send(400, { error: out.error });
        }
        if (url.pathname === "/api/zero-result" && req.method === "POST") {
          api.recordZeroResult(session, (await body(req)) as never);
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
          notifier.subscribe(session.userId, {
            endpoint: b.endpoint,
            keys: { p256dh: b.keys.p256dh, auth: b.keys.auth },
          });
          return send(200, { ok: true });
        }
        if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
          const b = await body(req);
          db.run("DELETE FROM push_subscriptions WHERE endpoint = ? AND userId = ?",
            String(b["endpoint"] ?? ""), session.userId);
          return send(200, { ok: true });
        }

        if (url.pathname === "/api/contact" && req.method === "PUT") {
          const b = await body(req);
          api.setContact(session.userId, String(b["kind"] ?? "phone"), String(b["value"] ?? ""));
          return send(200, { ok: true });
        }
        if (url.pathname === "/api/contact" && req.method === "POST") {
          const b = await body(req);
          const revealed = api.revealContact(session, String(b["bookingId"] ?? ""));
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
            return send(200, { pending: accounts.pending() });
          }
          if (url.pathname === "/api/admin/approve" && req.method === "POST") {
            const b = await body(req);
            const userId = String(b["userId"] ?? "");
            const issued = access.approve(userId, session.userId);
            if (!issued) return send(404, { error: "No such request." });
            // Approval nobody is told about is indistinguishable from being
            // refused. They have never signed in, so this reaches them by
            // email — the reason a personal address is asked for at all.
            if (issued.kind === "link") {
              void notifier.send(notifications.registrationApproved(userId)).catch(() => {});
            }
            return send(200, issued);
          }
          if (url.pathname === "/api/admin/invite" && req.method === "POST") {
            const b = await body(req);
            return send(200, access.invite(String(b["displayName"] ?? ""), session.userId));
          }
          if (url.pathname === "/api/admin/suspend" && req.method === "POST") {
            const b = await body(req);
            access.suspend(String(b["userId"] ?? ""), session.userId);
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

const server = OWN_TLS
  ? createSecureServer({ cert: readFileSync(TLS_CERT!), key: readFileSync(TLS_KEY!) }, handler)
  : createServer(handler);

// Without TLS, bind to loopback only. A pilot reachable across the office in
// the clear is worse than a pilot nobody can reach, because the second failure
// is visible and the first is not.
const HOST = SECURE ? "0.0.0.0" : "127.0.0.1";

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

const runReconfirmSweep = (): void => {
  try {
    const now = Date.now();
    const soon = new Date(now + RECONFIRM_WINDOW_MS).toISOString();
    const nowIso = new Date(now).toISOString();

    const due = db.all<{
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

setInterval(runReconfirmSweep, SCHEDULER_TICK_MS).unref();

server.listen(PORT, HOST, () => {
  const scheme = OWN_TLS ? "https" : "http";
  console.log(`Ekpothe — pilot server`);
  console.log(`  ${scheme}://${HOST === "0.0.0.0" ? "0.0.0.0" : "localhost"}:${PORT}`);
  console.log(`  database:   ${DB_PATH}`);
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
    void mailer.verify().then((v) => {
      console.log(
        v.ok
          ? "  email:      relay reachable and accepted the login"
          : `  email:      BROKEN — ${v.error}\n              Approval mail will not arrive. See docs/EMAIL_SETUP.md`,
      );
    });
  }
  console.log(
    `  joining:    colleagues register themselves, ${BLOCKED_DOMAINS.map((d) => `@${d}`).join(", ")} refused; you approve`,
  );
  if (OWN_TLS) {
    console.log(`  TLS:        this process, from TLS_CERT and TLS_KEY`);
  } else if (TRUST_PROXY) {
    console.log(`  TLS:        terminated upstream (TRUST_PROXY=1)`);
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
