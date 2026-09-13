import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { dropIfCreated, freshDb, hasPostgres, type TestDb } from "./test-db.js";

/**
 * Places colleagues looked for and Ekpothe does not know.
 *
 * The place list is closed on purpose — free entry is what produced four
 * spellings of one destination from a single colleague in the legacy workbook,
 * and matching cannot run over prose. But a closed list nobody can add to is a
 * closed door for everybody who lives somewhere it does not name, and "no place
 * by that name" was the end of the road.
 *
 * These tests cover the grouping the administrator's screen depends on, because
 * the decision to add a place turns on *how many people* asked rather than how
 * many times it was asked.
 */

let handle: TestDb;
let db: Db;

beforeEach(async () => {
  handle = await freshDb();
  db = handle.db;
  for (const [id, name] of [["u1", "Nusrat"], ["u2", "Tahmina"], ["u3", "Rafiq"]] as const) {
    await db.run(
      "INSERT INTO users (id, displayName, email, status, createdAt) VALUES (?, ?, ?, 'approved', ?)",
      id,
      name,
      `${id}@example.com`,
      new Date().toISOString(),
    );
  }
});
afterEach(async () => {
  await dropIfCreated(handle);
});

const ask = async (userId: string, text: string, at = new Date().toISOString()): Promise<void> => {
  await db.run(
    "INSERT INTO place_requests (id, text, askedBy, askedAt) VALUES (?, ?, ?, ?)",
    randomUUID(),
    text,
    userId,
    at,
  );
};

interface Row { text: string; asks: string; people: string }
const openRequests = async (): Promise<Row[]> =>
  await db.all<Row>(
    `SELECT text, COUNT(*) AS asks, COUNT(DISTINCT askedBy) AS people
       FROM place_requests
      WHERE handledAt IS NULL
      GROUP BY text
      ORDER BY COUNT(DISTINCT askedBy) DESC, MAX(askedAt) DESC`,
  );

describe.skipIf(!hasPostgres)("what colleagues could not find", () => {
  it("tells three colleagues apart from three searches", async () => {
    // The whole reason for grouping. One person who cannot spell a place is not
    // evidence that the place belongs in the list; three people who want the
    // same one is.
    await ask("u1", "Basila");
    await ask("u1", "Basila");
    await ask("u1", "Basila");
    await ask("u1", "Keraniganj");
    await ask("u2", "Keraniganj");
    await ask("u3", "Keraniganj");

    const rows = await openRequests();
    expect(rows.map((r) => r.text)).toEqual(["Keraniganj", "Basila"]);
    expect(Number(rows[0]!.people)).toBe(3);
    expect(Number(rows[1]!.people)).toBe(1);
    expect(Number(rows[1]!.asks)).toBe(3);
  });

  it("clears every ask for a place when the administrator is done with it", async () => {
    await ask("u1", "Basila");
    await ask("u2", "Basila");
    // Dismissing is a decision about the place, not about one colleague's
    // search, so it takes all of them or the row comes straight back.
    await db.run(
      "UPDATE place_requests SET handledAt = ? WHERE text = ? AND handledAt IS NULL",
      new Date().toISOString(),
      "Basila",
    );
    expect(await openRequests()).toEqual([]);
  });

  it("shows a place again when somebody asks after it was dismissed", async () => {
    await ask("u1", "Basila");
    await db.run("UPDATE place_requests SET handledAt = ? WHERE text = ?", new Date().toISOString(), "Basila");
    await ask("u2", "Basila");
    // Kept rather than deleted precisely so that asking again is visible. A
    // place dismissed in March and wanted again in June is a new fact.
    expect((await openRequests()).map((r) => r.text)).toEqual(["Basila"]);
  });

  it("keeps what somebody typed, rather than a tidied version of it", async () => {
    // It is evidence about what colleagues call the place, which is exactly
    // what the alias list needs. Normalising it here would throw that away.
    await ask("u1", "ECB chottor");
    expect((await openRequests())[0]!.text).toBe("ECB chottor");
  });

  it("survives the colleague being removed", async () => {
    await ask("u1", "Basila");
    await db.run("UPDATE users SET status = 'suspended', isSuspended = 1 WHERE id = ?", "u1");
    // Suspension does not delete the row, and the request is about a place
    // rather than about them.
    expect((await openRequests()).map((r) => r.text)).toEqual(["Basila"]);
  });
});
