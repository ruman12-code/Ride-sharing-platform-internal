/**
 * Build the offline route table. Run once by an administrator, never by the app.
 *
 *   npx tsx tools/build-route-table.ts                 # local graph, no network
 *   GOOGLE_MAPS_API_KEY=... npx tsx tools/build-route-table.ts --google
 *
 * Writes `src/adapters/routing/route-table.json`, which ships with the app.
 *
 * Why this exists: it is how the product gets real road distances without ever
 * disclosing a colleague's journey. The provider is asked about pairs of public
 * landmarks, once, with no identity and no timestamp attached, and the answers
 * are then served locally forever. See docs/ADR-002-routing.md.
 *
 * Re-run it when zones are added or when road distances are thought to have
 * changed materially. Nothing breaks if you never do: pairs missing from the
 * table fall back to the local graph.
 */
import { writeFileSync } from "node:fs";
import { ZONES } from "../src/adapters/local-json/seed/zones.js";
import { ZoneGraph } from "../src/domain/matching/geo.js";
import type { RouteTable, RouteTableEntry } from "../src/adapters/routing/route-table.js";

const useGoogle = process.argv.includes("--google");
const apiKey = process.env["GOOGLE_MAPS_API_KEY"];

if (useGoogle && !apiKey) {
  console.error("--google needs GOOGLE_MAPS_API_KEY in the environment.");
  process.exit(1);
}

const graph = new ZoneGraph(ZONES);

/** Ask Google for one pair. Zone centroids only — never a colleague's location. */
const googleDistance = async (
  from: (typeof ZONES)[number],
  to: (typeof ZONES)[number],
): Promise<{ km: number; minutes: number } | undefined> => {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${from.lat},${from.lng}`);
  url.searchParams.set("destination", `${to.lat},${to.lng}`);
  url.searchParams.set("region", "bd");
  // Deliberately NOT departure_time=now. Live traffic would bake one moment's
  // congestion into a table used for months, and would be the only part of this
  // request that could correlate with when somebody actually travels.
  url.searchParams.set("key", apiKey!);

  const res = await fetch(url.toString());
  if (!res.ok) return undefined;
  const body = (await res.json()) as {
    status: string;
    routes?: { legs?: { distance?: { value: number }; duration?: { value: number } }[] }[];
  };
  if (body.status !== "OK" || !body.routes?.[0]?.legs) return undefined;
  const legs = body.routes[0].legs;
  return {
    km: Math.round((legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0) / 1000) * 10) / 10,
    minutes: Math.round(legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0) / 60),
  };
};

const main = async (): Promise<void> => {
  const entries: RouteTableEntry[] = [];
  let queried = 0;
  let skipped = 0;

  for (const from of ZONES) {
    for (const to of ZONES) {
      if (from.id === to.id) continue;

      // The local graph supplies the stop sequence in both modes: it is what
      // decides which zones a rider can board at, and it needs no network.
      const local = graph.route(from.id, to.id);
      if (!local) {
        skipped += 1;
        continue;
      }

      if (!useGoogle) {
        entries.push({
          from: from.id,
          to: to.id,
          zoneSequence: local.zoneSequence,
          distanceKm: local.distanceKm,
          durationMinutes: local.durationMinutes,
        });
        continue;
      }

      const real = await googleDistance(from, to);
      queried += 1;
      entries.push({
        from: from.id,
        to: to.id,
        zoneSequence: local.zoneSequence,
        distanceKm: real?.km ?? local.distanceKm,
        durationMinutes: real?.minutes ?? local.durationMinutes,
      });
      // Courtesy rate limit. This runs once; it does not need to be fast.
      await new Promise((r) => setTimeout(r, 120));
      if (queried % 50 === 0) console.log(`  ${queried} pairs…`);
    }
  }

  const table: RouteTable = {
    provider: useGoogle ? "google-directions" : "zone-graph",
    generatedAt: new Date().toISOString(),
    zoneCount: ZONES.length,
    entries,
  };

  const out = new URL("../src/adapters/routing/route-table.json", import.meta.url);
  writeFileSync(out, JSON.stringify(table, null, 0), "utf8");

  console.log(`provider    : ${table.provider}`);
  console.log(`zones       : ${ZONES.length}`);
  console.log(`pairs       : ${entries.length}${skipped ? ` (${skipped} unreachable)` : ""}`);
  if (useGoogle) console.log(`API calls   : ${queried} (one-off; the app makes none)`);
  console.log(`written     : src/adapters/routing/route-table.json`);
};

void main();
