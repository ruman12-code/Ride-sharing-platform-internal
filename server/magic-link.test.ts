import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db.js";
import { freshDb, hasPostgres, type TestDb } from "./test-db.js";
import { LINK_VALID_MINUTES, MAX_LINKS_PER_HOUR, MagicLinks } from "./magic-link.js";

let handle: TestDb;
let db: Db;
let links: MagicLinks;

const NOW = new Date("2026-09-04T09:00:00Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const addUser = async (
  id: string,
  email: string,
  over: { status?: string; isSuspended?: number } = {},
) =>
  db.run(
    `INSERT INTO users (id, displayName, email, status, isSuspended, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    "Nusrat",
    email,
    over.status ?? "approved",
    over.isSuspended ?? 0,
    NOW.toISOString(),
  );

beforeEach(async () => {
  handle = await freshDb();
  db = handle.db;
  links = new MagicLinks(db);
  await addUser("u-nusrat", "nusrat@personal.com");
});
afterEach(async () => {
  await handle.drop();
});

describe.skipIf(!hasPostgres)("asking for a link", () => {
  it("mints one for an approved colleague", async () => {
    const out = await links.request("nusrat@personal.com", NOW);
    expect(out?.userId).toBe("u-nusrat");
    expect(out?.token).toContain(".");
  });

  it("is case- and space-insensitive, because people retype their own address", async () => {
    expect((await links.request("  NUSRAT@Personal.com ", NOW))?.userId).toBe("u-nusrat");
  });

  it("declines silently for an address with no account", async () => {
    expect(await links.request("stranger@personal.com", NOW)).toBeUndefined();
  });

  it("declines for somebody still waiting for approval", async () => {
    await addUser("u-pending", "pending@personal.com", { status: "pending" });
    expect(await links.request("pending@personal.com", NOW)).toBeUndefined();
  });

  it("declines for somebody suspended", async () => {
    await addUser("u-gone", "gone@personal.com", { isSuspended: 1 });
    expect(await links.request("gone@personal.com", NOW)).toBeUndefined();
  });

  it("stops after too many in an hour", async () => {
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) {
      expect(await links.request("nusrat@personal.com", later(i))).toBeDefined();
    }
    expect(await links.request("nusrat@personal.com", later(MAX_LINKS_PER_HOUR))).toBeUndefined();
  });

  it("allows more once the hour has passed", async () => {
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) await links.request("nusrat@personal.com", later(i));
    expect(await links.request("nusrat@personal.com", later(61))).toBeDefined();
  });

  it("retires the previous link, so only the newest one works", async () => {
    const first = await links.request("nusrat@personal.com", NOW)!;
    const second = await links.request("nusrat@personal.com", later(1))!;
    expect(await links.redeem(first.token, later(2))).toBeUndefined();
    expect(await links.redeem(second.token, later(2))).toBe("u-nusrat");
  });

  it("keeps the token short enough to survive a wrapped plain-text email", async () => {
    // 76 columns is where mail wraps. A token that pushes the URL past that is
    // delivered split across lines, and the colleague who copies it by hand
    // gets half of it.
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    expect(token.length).toBeLessThanOrEqual(40);
    expect(`https://ekpothe.example.org/enter?t=${token}`.length).toBeLessThan(76);
  });

  it("does not repeat a token across many requests", { timeout: 30_000 }, async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      // A fresh hour each time, to stay clear of the per-hour limit.
      seen.add((await links.request("nusrat@personal.com", later(i * 61)))!.token);
    }
    expect(seen.size).toBe(200);
  });

  it("stores nothing that can be used to sign in", async () => {
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    const secret = token.split(".")[1]!;
    const row = await db.get<{ tokenHash: string }>("SELECT tokenHash FROM login_links")!;
    expect(row.tokenHash).not.toContain(secret);
    expect(row.tokenHash).toHaveLength(64);
  });
});

describe.skipIf(!hasPostgres)("redeeming a link", () => {
  it("signs the colleague in", async () => {
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    expect(await links.redeem(token, later(1))).toBe("u-nusrat");
  });

  it("works exactly once", async () => {
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    expect(await links.redeem(token, later(1))).toBe("u-nusrat");
    // A mail scanner that follows the link, or a second tap a day later.
    expect(await links.redeem(token, later(2))).toBeUndefined();
  });

  it("expires", async () => {
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    expect(await links.redeem(token, later(LINK_VALID_MINUTES + 1))).toBeUndefined();
    expect(LINK_VALID_MINUTES).toBe(20);
  });

  it("refuses a token whose secret is wrong, even with a real row id", async () => {
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    const id = token.split(".")[0]!;
    expect(await links.redeem(`${id}.not-the-secret`, later(1))).toBeUndefined();
    // And the real one still works, so a wrong guess does not consume the link.
    expect(await links.redeem(token, later(1))).toBe("u-nusrat");
  });

  it("refuses junk", async () => {
    for (const junk of ["", ".", "no-dot", "a.b", "....", "  "]) {
      expect(await links.redeem(junk, later(1))).toBeUndefined();
    }
  });

  it("refuses somebody suspended after the link was sent", async () => {
    // The link was valid when it was minted. Twenty minutes is long enough for
    // an administrator to have removed them in between.
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    await db.run("UPDATE users SET isSuspended = 1 WHERE id = 'u-nusrat'");
    expect(await links.redeem(token, later(1))).toBeUndefined();
  });

  it("writes an audit row, so a sign-in is accounted for", async () => {
    const { token } = await links.request("nusrat@personal.com", NOW)!;
    await links.redeem(token, later(1));
    const actions = (await db.all<{ action: string }>("SELECT action FROM audit_log")).map((a) => a.action);
    expect(actions).toContain("sign-in-link");
  });
});
