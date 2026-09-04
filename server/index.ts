import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Db } from "./db.js";
import { Api, type Session } from "./api.js";
import { Access, parseAllowedDomains } from "./access.js";
import { FUEL_PRICES } from "../src/adapters/local-json/seed/fuel.js";

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
const ALLOWED_DOMAINS = parseAllowedDomains(process.env["ALLOWED_EMAIL_DOMAINS"]);
if (ALLOWED_DOMAINS.length === 0) {
  console.error(
    "ALLOWED_EMAIL_DOMAINS is not set.\n" +
      "Refusing to start: without it there is nothing stopping any email address\n" +
      "from requesting access.\n" +
      "  ALLOWED_EMAIL_DOMAINS='yourcompany.org' node dist-server/server/index.js",
  );
  process.exit(1);
}

/** The first administrator, who approves everybody else. */
const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "").trim().toLowerCase();
if (!ADMIN_EMAIL) {
  console.error(
    "ADMIN_EMAIL is not set.\n" +
      "Refusing to start: somebody has to be able to approve the first request.\n" +
      "  ADMIN_EMAIL='you@yourcompany.org' node dist-server/server/index.js",
  );
  process.exit(1);
}

const db = new Db(DB_PATH);
const api = new Api(db);
// Salts the hashed addresses used for rate limiting. Regenerated on restart:
// the counter is a rate limit, not a log, so losing it is correct.
const access = new Access(db, ALLOWED_DOMAINS, randomUUID());

// Seed the administrator, approved and with a code, so there is a way in on a
// brand-new database.
{
  const existing = db.get<{ id: string; status: string }>(
    "SELECT id, status FROM users WHERE email = ?",
    ADMIN_EMAIL,
  );
  if (!existing) {
    const id = randomUUID();
    db.run(
      `INSERT INTO users (id, displayName, email, role, status, createdAt)
       VALUES (?, ?, ?, 'admin', 'pending', ?)`,
      id, ADMIN_EMAIL.split("@")[0], ADMIN_EMAIL, new Date().toISOString(),
    );
    const issued = access.approve(id, "system");
    console.log("");
    console.log(`  ADMIN CODE for ${ADMIN_EMAIL}: ${issued?.code}`);
    console.log("  Use it once to sign in. It is not stored and will not be shown again.");
  }
}

// Seed the dated fuel prices once, so cost shares are computable on first run.
for (const p of FUEL_PRICES) {
  db.run(
    `INSERT OR IGNORE INTO fuel_prices (id, fuelType, pricePerLitre, effectiveFrom, source, confirmedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    p.id, p.fuelType, p.pricePerLitre, p.effectiveFrom, p.source, p.confirmedAt ?? null,
  );
}

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
        if (url.pathname === "/api/request-access" && req.method === "POST") {
          const b = await body(req);
          const ip =
            (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
            req.socket.remoteAddress ??
            "unknown";
          return send(200, access.request(String(b["email"] ?? ""), String(b["displayName"] ?? ""), ip));
        }

        if (url.pathname === "/api/sign-in" && req.method === "POST") {
          const b = await body(req);
          const userId = access.redeem(String(b["email"] ?? ""), String(b["code"] ?? ""));
          // One message for every failure. Distinguishing "not approved" from
          // "wrong code" would turn this into a way of finding out who works here.
          if (!userId) {
            return send(401, {
              error: "That code is not valid. Ask the administrator for a new one.",
            });
          }
          const token = api.createSession(userId);
          res.setHeader(
            "set-cookie",
            `cp=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}` +
              (SECURE ? "; Secure" : ""),
          );
          return send(200, api.sessionFor(token));
        }

        if (url.pathname === "/api/me") {
          return session ? send(200, session) : send(401, { error: "Not signed in." });
        }

        if (!session) return send(401, { error: "Not signed in." });

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
          return out.ok ? send(201, out.booking) : send(409, { error: out.error, code: out.code });
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
            return send(200, { pending: access.pending() });
          }
          if (url.pathname === "/api/admin/approve" && req.method === "POST") {
            const b = await body(req);
            const issued = access.approve(String(b["userId"] ?? ""), session.userId);
            return issued
              ? send(200, issued)
              : send(404, { error: "No such request." });
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

server.listen(PORT, HOST, () => {
  const scheme = OWN_TLS ? "https" : "http";
  console.log(`Ekpothe — pilot server`);
  console.log(`  ${scheme}://${HOST === "0.0.0.0" ? "0.0.0.0" : "localhost"}:${PORT}`);
  console.log(`  database:   ${DB_PATH}`);
  console.log(`  domains:    ${ALLOWED_DOMAINS.map((d) => `@${d}`).join(", ")}`);
  console.log(`  admin:      ${ADMIN_EMAIL}`);
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
