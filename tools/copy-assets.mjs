import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Copy the non-TypeScript files the compiled server reads at runtime.
 *
 * `tsc` emits .js and nothing else, so schema.sql never reached dist-server on
 * its own. It had been copied there by hand once, which meant every schema
 * change afterwards was silently absent from a built server — the app ran, and
 * then failed at the first query against a table that only existed in source.
 *
 * Running this as part of `build:server` is what stops that recurring, and
 * matters most where nobody is watching a terminal: a deployed container builds
 * from a clean checkout, so a missed copy there is a broken deploy.
 */
const ASSETS = [["server/schema.sql", "dist-server/server/schema.sql"]];

for (const [from, to] of ASSETS) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}
