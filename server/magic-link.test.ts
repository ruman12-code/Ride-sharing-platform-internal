import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db } from "./db.js";
import { LINK_VALID_MINUTES, MAX_LINKS_PER_HOUR, MagicLinks } from "./magic-link.js";

let dir: string;
let db: Db;
let links: MagicLinks;

const NOW = new Date("2026-09-04T09:00:00Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const addUser = (
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "links-"));
  db = new Db(join(dir, "t.db"));
  links = new MagicLinks(db);
  addUser("u-nusrat", "nusrat@personal.com");
});
afterEach(() => {
  db.close?.();
  rmSync(dir, { recursive: true, force: true });
});

describe("asking for a link", () => {
  it("mints one for an approved colleague", () => {
    const out = links.request("nusrat@personal.com", NOW);
    expect(out?.userId).toBe("u-nusrat");
    expect(out?.token).toContain(".");
  });

  it("is case- and space-insensitive, because people retype their own address", () => {
    expect(links.request("  NUSRAT@Personal.com ", NOW)?.userId).toBe("u-nusrat");
  });

  it("declines silently for an address with no account", () => {
    expect(links.request("stranger@personal.com", NOW)).toBeUndefined();
  });

  it("declines for somebody still waiting for approval", () => {
    addUser("u-pending", "pending@personal.com", { status: "pending" });
    expect(links.request("pending@personal.com", NOW)).toBeUndefined();
  });

  it("declines for somebody suspended", () => {
    addUser("u-gone", "gone@personal.com", { isSuspended: 1 });
    expect(links.request("gone@personal.com", NOW)).toBeUndefined();
  });

  it("stops after too many in an hour", () => {
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) {
      expect(links.request("nusrat@personal.com", later(i))).toBeDefined();
    }
    expect(links.request("nusrat@personal.com", later(MAX_LINKS_PER_HOUR))).toBeUndefined();
  });

  it("allows more once the hour has passed", () => {
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) links.request("nusrat@personal.com", later(i));
    expect(links.request("nusrat@personal.com", later(61))).toBeDefined();
  });

  it("retires the previous link, so only the newest one works", () => {
    const first = links.request("nusrat@personal.com", NOW)!;
    const second = links.request("nusrat@personal.com", later(1))!;
    expect(links.redeem(first.token, later(2))).toBeUndefined();
    expect(links.redeem(second.token, later(2))).toBe("u-nusrat");
  });

  it("keeps the token short enough to survive a wrapped plain-text email", () => {
    // 76 columns is where mail wraps. A token that pushes the URL past that is
    // delivered split across lines, and the colleague who copies it by hand
    // gets half of it.
    const { token } = links.request("nusrat@personal.com", NOW)!;
    expect(token.length).toBeLessThanOrEqual(40);
    expect(`https://ekpothe.example.org/enter?t=${token}`.length).toBeLessThan(76);
  });

  it("does not repeat a token across many requests", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      // A fresh hour each time, to stay clear of the per-hour limit.
      seen.add(links.request("nusrat@personal.com", later(i * 61))!.token);
    }
    expect(seen.size).toBe(200);
  });

  it("stores nothing that can be used to sign in", () => {
    const { token } = links.request("nusrat@personal.com", NOW)!;
    const secret = token.split(".")[1]!;
    const row = db.get<{ tokenHash: string }>("SELECT tokenHash FROM login_links")!;
    expect(row.tokenHash).not.toContain(secret);
    expect(row.tokenHash).toHaveLength(64);
  });
});

describe("redeeming a link", () => {
  it("signs the colleague in", () => {
    const { token } = links.request("nusrat@personal.com", NOW)!;
    expect(links.redeem(token, later(1))).toBe("u-nusrat");
  });

  it("works exactly once", () => {
    const { token } = links.request("nusrat@personal.com", NOW)!;
    expect(links.redeem(token, later(1))).toBe("u-nusrat");
    // A mail scanner that follows the link, or a second tap a day later.
    expect(links.redeem(token, later(2))).toBeUndefined();
  });

  it("expires", () => {
    const { token } = links.request("nusrat@personal.com", NOW)!;
    expect(links.redeem(token, later(LINK_VALID_MINUTES + 1))).toBeUndefined();
    expect(LINK_VALID_MINUTES).toBe(20);
  });

  it("refuses a token whose secret is wrong, even with a real row id", () => {
    const { token } = links.request("nusrat@personal.com", NOW)!;
    const id = token.split(".")[0]!;
    expect(links.redeem(`${id}.not-the-secret`, later(1))).toBeUndefined();
    // And the real one still works, so a wrong guess does not consume the link.
    expect(links.redeem(token, later(1))).toBe("u-nusrat");
  });

  it("refuses junk", () => {
    for (const junk of ["", ".", "no-dot", "a.b", "....", "  "]) {
      expect(links.redeem(junk, later(1))).toBeUndefined();
    }
  });

  it("refuses somebody suspended after the link was sent", () => {
    // The link was valid when it was minted. Twenty minutes is long enough for
    // an administrator to have removed them in between.
    const { token } = links.request("nusrat@personal.com", NOW)!;
    db.run("UPDATE users SET isSuspended = 1 WHERE id = 'u-nusrat'");
    expect(links.redeem(token, later(1))).toBeUndefined();
  });

  it("writes an audit row, so a sign-in is accounted for", () => {
    const { token } = links.request("nusrat@personal.com", NOW)!;
    links.redeem(token, later(1));
    const actions = db.all<{ action: string }>("SELECT action FROM audit_log").map((a) => a.action);
    expect(actions).toContain("sign-in-link");
  });
});
