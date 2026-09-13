import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db.js";
import { dropIfCreated, freshDb, hasPostgres, type TestDb } from "./test-db.js";
import { Access, type ApprovalResult, CODE_VALID_DAYS, generateCode } from "./access.js";
import { MagicLinks } from "./magic-link.js";

/**
 * What is left of `Access` after sign-in links took over.
 *
 * Codes exist for one case only: the colleague a link cannot reach. Their row
 * carries an `invite:` placeholder address, which is what tells approval to
 * mint a code rather than assume an email will do.
 */

let handle: TestDb;
let db: Db;
let access: Access;

beforeEach(async () => {
  handle = await freshDb();
  db = handle.db;
  access = new Access(db);
});
afterEach(async () => {
  await dropIfCreated(handle);
});

const codeOf = (r: ApprovalResult | undefined): string => {
  if (r?.kind !== "code") throw new Error(`expected a minted code, got ${JSON.stringify(r)}`);
  return r.code;
};

describe.skipIf(!hasPostgres)("the code alphabet", () => {
  it("avoids the characters people mishear and mistype", async () => {
    // Read aloud down a corridor or over the phone: O/0 and I/1 are the pairs
    // that come back wrong.
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("does not repeat itself", async () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(seen.size).toBe(500);
  });
});

describe.skipIf(!hasPostgres)("inviting a colleague a link cannot reach", () => {
  it("mints a code that admits them once", async () => {
    const { code, userId } = await access.invite("Nusrat", "admin");
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(await access.redeemByCode(code)).toBe(userId);
  });

  it("consumes the code, so a forwarded code is useless", async () => {
    const { code } = await access.invite("Nusrat", "admin");
    expect(await access.redeemByCode(code)).toBeDefined();
    expect(await access.redeemByCode(code)).toBeUndefined();
  });

  it("is case-insensitive, because people retype what they were told", async () => {
    const { code, userId } = await access.invite("Nusrat", "admin");
    expect(await access.redeemByCode(code.toLowerCase())).toBe(userId);
  });

  it("lets them choose the name colleagues will see", async () => {
    const { code, userId } = await access.invite("Nusrat", "admin");
    await access.redeemByCode(code, "Nusrat Jahan");
    const row = await db.get<{ displayName: string }>("SELECT displayName FROM users WHERE id = ?", userId)!;
    expect(row.displayName).toBe("Nusrat Jahan");
  });

  it("refuses a wrong code", async () => {
    await access.invite("Nusrat", "admin");
    expect(await access.redeemByCode("AAAAAA")).toBeUndefined();
  });

  it("refuses anyone suspended since the code was issued", async () => {
    const { code, userId } = await access.invite("Nusrat", "admin");
    await access.suspend(userId, "admin");
    expect(await access.redeemByCode(code)).toBeUndefined();
  });

  it("expires a code after a week", async () => {
    const { code, userId } = await access.invite("Nusrat", "admin");
    await db.run(
      "UPDATE invite_codes SET expiresAt = ? WHERE userId = ?",
      new Date(Date.now() - 1000).toISOString(),
      userId,
    );
    expect(await access.redeemByCode(code)).toBeUndefined();
    expect(CODE_VALID_DAYS).toBe(7);
  });

  it("stores only a hash — a copy of the database hands nobody a working code", async () => {
    const { code } = await access.invite("Nusrat", "admin");
    const rows = await db.all<{ codeHash: string }>("SELECT codeHash FROM invite_codes");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code);
    expect(rows[0]!.codeHash).toHaveLength(64);
  });

  it("invalidates an earlier unused code when re-approving", async () => {
    const { userId } = await access.invite("Nusrat", "admin");
    const second = codeOf(await access.approve(userId, "admin"));
    // The first is gone; only the newest code works.
    expect(await access.redeemByCode(second)).toBe(userId);
  });
});

describe.skipIf(!hasPostgres)("approving somebody who gave a real address", () => {
  const register = async (email: string) => {
    const id = "u-1";
    await db.run(
      "INSERT INTO users (id, displayName, email, status, createdAt) VALUES (?, 'Nusrat', ?, 'pending', ?)",
      id,
      email,
      new Date().toISOString(),
    );
    return id;
  };

  it("mints a code even though they gave a real address", async () => {
    // Email is not dependable: hosts block SMTP, providers suspend accounts.
    // A code needs nobody's servers, so approval always produces one.
    const id = await register("nusrat@personal.com");
    const issued = await access.approve(id, "admin");
    expect(issued?.kind).toBe("code");
    expect(await db.all("SELECT id FROM invite_codes WHERE userId = ?", id)).toHaveLength(1);
  });

  it("admits them with that code, without touching their chosen name", async () => {
    const id = await register("nusrat@personal.com");
    const code = codeOf(await access.approve(id, "admin"));
    expect(await access.redeemByCode(code)).toBe(id);
    const row = await db.get<{ displayName: string }>("SELECT displayName FROM users WHERE id = ?", id);
    expect(row?.displayName).toBe("Nusrat");
  });

  it("marks them approved and records who did it", async () => {
    const id = await register("nusrat@personal.com");
    await access.approve(id, "admin-1");
    const row = await db.get<{ status: string; approvedBy: string }>(
      "SELECT status, approvedBy FROM users WHERE id = ?",
      id,
    )!;
    expect(row).toMatchObject({ status: "approved", approvedBy: "admin-1" });
  });

  it("returns nothing for a user who does not exist", async () => {
    expect(await access.approve("no-such-user", "admin")).toBeUndefined();
  });

  it("writes an audit row", async () => {
    const id = await register("nusrat@personal.com");
    await access.approve(id, "admin");
    const actions = (await db.all<{ action: string }>("SELECT action FROM audit_log")).map((a) => a.action);
    expect(actions).toContain("approve");
  });
});

describe.skipIf(!hasPostgres)("suspending", () => {
  it("ends access immediately, not at the next sign-in", async () => {
    const { code, userId } = await access.invite("Nusrat", "admin");
    await access.redeemByCode(code);
    await db.run(
      "INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
      "tok", userId, new Date().toISOString(), "2099-01-01T00:00:00Z",
    );

    await access.suspend(userId, "admin");

    // The open session is destroyed, not left to lapse.
    expect(await db.all("SELECT token FROM sessions WHERE userId = ?", userId)).toHaveLength(0);
    const row = await db.get<{ status: string; isSuspended: number }>(
      "SELECT status, isSuspended FROM users WHERE id = ?",
      userId,
    )!;
    // Both columns: the doors read one and the booking rules read the other.
    expect(row).toEqual({ status: "suspended", isSuspended: 1 });
  });

  it("kills a sign-in link that is already in their inbox", async () => {
    const { userId } = await access.invite("Nusrat", "admin");
    await db.run("UPDATE users SET email = 'nusrat@personal.com', status = 'approved' WHERE id = ?", userId);
    const links = new MagicLinks(db);
    const { token } = await links.request("nusrat@personal.com")!;

    await access.suspend(userId, "admin");

    // Otherwise a mail sent a minute ago is a way back in for somebody who has
    // just been removed.
    expect(await links.redeem(token)).toBeUndefined();
  });

  it("writes an audit row", async () => {
    const { userId } = await access.invite("Nusrat", "admin");
    await access.suspend(userId, "admin");
    const actions = (await db.all<{ action: string }>("SELECT action FROM audit_log")).map((a) => a.action);
    expect(actions).toContain("suspend");
  });
});

describe.skipIf(!hasPostgres)("issuing a fresh code to somebody already in", () => {
  /*
    The way back for a colleague who has lost their access rather than their
    approval. Until this existed there was none: a code is single-use, a session
    lasts ninety days, and the other door needs a mail provider this pilot has
    repeatedly not had. Every colleague was on a ninety-day fuse.
  */
  const joined = async (name = "Nusrat"): Promise<string> => {
    const { userId } = await access.invite(name, "admin");
    return userId;
  };

  it("lets somebody in again after their first code was spent", async () => {
    const userId = await joined();
    // The whole scenario, in three lines: they joined, then changed phone.
    const first = (await access.reissue(userId, "admin"))!.code;
    expect(await access.redeemByCode(first)).toBe(userId);

    const second = (await access.reissue(userId, "admin"))!.code;
    expect(await access.redeemByCode(second)).toBe(userId);
  });

  it("kills the previous code, so a forwarded one stops working", async () => {
    const userId = await joined();
    const old = (await access.reissue(userId, "admin"))!.code;
    const fresh = (await access.reissue(userId, "admin"))!.code;

    // Two live codes for one colleague would mean the code you sent last week
    // still opens the door after you issued a new one — which is the thing
    // reissuing exists to undo.
    expect(await access.redeemByCode(old)).toBeUndefined();
    expect(await access.redeemByCode(fresh)).toBe(userId);
  });

  it("does not rewrite who vouched for them, or when", async () => {
    const userId = await joined();
    const before = await db.get<{ approvedBy: string; approvedAt: string }>(
      "SELECT approvedBy, approvedAt FROM users WHERE id = ?",
      userId,
    );
    await access.reissue(userId, "someone-else");
    const after = await db.get<{ approvedBy: string; approvedAt: string }>(
      "SELECT approvedBy, approvedAt FROM users WHERE id = ?",
      userId,
    );
    // That record is the only thing standing behind the claim that somebody
    // recognised this colleague. Losing a phone must not replace it.
    expect(after).toEqual(before);
  });

  it("refuses somebody suspended", async () => {
    const userId = await joined();
    await access.suspend(userId, "admin");
    // A button labelled as a convenience must not be a way back in for somebody
    // who has just been removed.
    expect(await access.reissue(userId, "admin")).toBeUndefined();
  });

  it("refuses somebody still waiting to be approved", async () => {
    await db.run(
      "INSERT INTO users (id, displayName, email, status, createdAt) VALUES (?, ?, ?, 'pending', ?)",
      "p1",
      "Waiting",
      "waiting@example.com",
      new Date().toISOString(),
    );
    // Approving them is a decision. Reissuing is not, and must not stand in
    // for one.
    expect(await access.reissue("p1", "admin")).toBeUndefined();
    expect(await access.redeemByCode("ANYTHG")).toBeUndefined();
  });

  it("refuses an id that is nobody", async () => {
    expect(await access.reissue("no-such-person", "admin")).toBeUndefined();
  });

  it("works for the administrator's own row", async () => {
    // The one person with nobody to ask. A spare key minted before they need
    // it is the difference between moving to a new phone and going back to the
    // environment variables.
    await db.run(
      `INSERT INTO users (id, displayName, email, status, role, createdAt)
       VALUES (?, ?, ?, 'approved', 'admin', ?)`,
      "the-admin",
      "Ruman",
      "ruman@personal.com",
      new Date().toISOString(),
    );
    const spare = (await access.reissue("the-admin", "the-admin"))!.code;
    expect(await access.redeemByCode(spare)).toBe("the-admin");
  });

  it("stores only a hash, so a copy of the database hands nobody a way in", async () => {
    const userId = await joined();
    const code = (await access.reissue(userId, "admin"))!.code;
    const rows = await db.all<{ codeHash: string }>("SELECT codeHash FROM invite_codes");
    for (const row of rows) expect(row.codeHash).not.toContain(code);
  });

  it("expires like any other code", async () => {
    const userId = await joined();
    await access.reissue(userId, "admin");
    const row = await db.get<{ createdAt: string; expiresAt: string }>(
      "SELECT createdAt, expiresAt FROM invite_codes WHERE userId = ? AND usedAt IS NULL",
      userId,
    );
    const days = (Date.parse(row!.expiresAt) - Date.parse(row!.createdAt)) / 86_400_000;
    expect(Math.round(days)).toBe(CODE_VALID_DAYS);
  });

  it("writes an audit row, because handing out a way in is accountable", async () => {
    const userId = await joined();
    await access.reissue(userId, "admin");
    const audit = await db.all<{ action: string }>(
      "SELECT action FROM audit_log WHERE entityId = ?",
      userId,
    );
    expect(audit.map((a) => a.action)).toContain("reissue-code");
  });
});
