import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Db } from "./db.js";
import { Api, type Session } from "./api.js";
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

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env["PORT"] ?? 8080);
const DB_PATH = process.env["DB_PATH"] ?? join(here, "..", "carpool.db");
const DIST = join(here, "..", "dist");

const PASSPHRASE = process.env["PILOT_PASSPHRASE"];
if (!PASSPHRASE) {
  console.error(
    "PILOT_PASSPHRASE is not set.\n" +
      "Refusing to start: without it anyone who finds the URL can post as a colleague.\n" +
      "  PILOT_PASSPHRASE='something-you-share-with-the-team' node server/index.js",
  );
  process.exit(1);
}

const db = new Db(DB_PATH);
const api = new Api(db, PASSPHRASE);

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

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const send = (status: number, data: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        // The pilot serves its own app from its own origin, so nothing needs
        // cross-origin access. Not granting it is one fewer way in.
        "x-content-type-options": "nosniff",
        "referrer-policy": "same-origin",
      });
      res.end(JSON.stringify(data));
    };

    try {
      if (url.pathname.startsWith("/api/")) {
        const session: Session | undefined = api.sessionFor(cookie(req));

        if (url.pathname === "/api/sign-in" && req.method === "POST") {
          const b = await body(req);
          const s = api.signIn(
            String(b["email"] ?? ""),
            String(b["displayName"] ?? ""),
            String(b["passphrase"] ?? ""),
          );
          if (!s) return send(401, { error: "Wrong passphrase, or that email doesn't look right." });
          const token = api.createSession(s.userId);
          res.setHeader(
            "set-cookie",
            `cp=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}` +
              (process.env["HTTPS"] === "1" ? "; Secure" : ""),
          );
          return send(200, s);
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
        return send(404, { error: "No such endpoint." });
      }

      // --- static app ---------------------------------------------------
      if (!existsSync(DIST)) {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        return res.end("The app has not been built yet. Run: npm run build");
      }
      // normalize() before joining, so "../" in a request cannot escape dist/.
      const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
      let file = join(DIST, rel);
      if (!file.startsWith(DIST) || !existsSync(file) || rel === "/") file = join(DIST, "index.html");
      res.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      return res.end(readFileSync(file));
    } catch (e) {
      // Never leak an internal message to a client. The log is where detail goes.
      console.error("request failed:", e);
      if (!res.headersSent) send(500, { error: "Something went wrong." });
      else res.end();
    }
  })();
});

server.listen(PORT, () => {
  console.log(`Ekpothe — pilot server`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  database: ${DB_PATH}`);
  console.log(`  passphrase: set (${PASSPHRASE.length} characters)`);
});
