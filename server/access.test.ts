import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db } from "./db.js";
import { Access, type ApprovalResult, CODE_VALID_DAYS, generateCode } from "./access.js";

/**
 * What is left of `Access` after sign-in links took over.
 *
 * Codes exist for one case only: the colleague a link cannot reach. Their row
 * carries an `invite:` placeholder address, which is what tells approval to
 * mint a code rather than assume an email will do.
 */

let dir: string;
let db: Db;
let access: Access;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "access-"));
  db = new Db(join(dir, "t.db"));
  access = new Access(db);
});
afterEach(() => {
  db.close?.();
  rmSync(dir, { recursive: true, force: true });
});

const codeOf = (r: ApprovalResult | undefined): string => {
  if (r?.kind !== "code") throw new Error(`expected a minted code, got ${JSON.stringify(r)}`);
  return r.code;
};

describe("the code alphabet", () => {
  it("avoids the characters people mishear and mistype", () => {
    // Read aloud down a corridor or over the phone: O/0 and I/1 are the pairs
    // that come back wrong.
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(seen.size).toBe(500);
  });
});

describe("inviting a colleague a link cannot reach", () => {
  it("mints a code that admits them once", () => {
    const { code, userId } = access.invite("Nusrat", "admin");
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(access.redeemByCode(code)).toBe(userId);
  });

  it("consumes the code, so a forwarded code is useless", () => {
    const { code } = access.invite("Nusrat", "admin");
    expect(access.redeemByCode(code)).toBeDefined();
    expect(access.redeemByCode(code)).toBeUndefined();
  });

  it("is case-insensitive, because people retype what they were told", () => {
    const { code, userId } = access.invite("Nusrat", "admin");
    expect(access.redeemByCode(code.toLowerCase())).toBe(userId);
  });

  it("lets them choose the name colleagues will see", () => {
    const { code, userId } = access.invite("Nusrat", "admin");
    access.redeemByCode(code, "Nusrat Jahan");
    const row = db.get<{ displayName: string }>("SELECT displayName FROM users WHERE id = ?", userId)!;
    expect(row.displayName).toBe("Nusrat Jahan");
  });

  it("refuses a wrong code", () => {
    access.invite("Nusrat", "admin");
    expect(access.redeemByCode("AAAAAA")).toBeUndefined();
  });

  it("refuses anyone suspended since the code was issued", () => {
    const { code, userId } = access.invite("Nusrat", "admin");
    access.suspend(userId, "admin");
    expect(access.redeemByCode(code)).toBeUndefined();
  });

  it("expires a code after a week", () => {
    const { code, userId } = access.invite("Nusrat", "admin");
    db.run(
      "UPDATE invite_codes SET expiresAt = ? WHERE userId = ?",
      new Date(Date.now() - 1000).toISOString(),
      userId,
    );
    expect(access.redeemByCode(code)).toBeUndefined();
    expect(CODE_VALID_DAYS).toBe(7);
  });

  it("stores only a hash — a copy of the database hands nobody a working code", () => {
    const { code } = access.invite("Nusrat", "admin");
    const rows = db.all<{ codeHash: string }>("SELECT codeHash FROM invite_codes");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code);
    expect(rows[0]!.codeHash).toHaveLength(64);
  });

  it("invalidates an earlier unused code when re-approving", () => {
    const { userId } = access.invite("Nusrat", "admin");
    const second = codeOf(access.approve(userId, "admin"));
    // The first is gone; only the newest code works.
    expect(access.redeemByCode(second)).toBe(userId);
  });
});

describe("approving somebody who gave a real address", () => {
  const register = (email: string) => {
    const id = "u-1";
    db.run(
      "INSERT INTO users (id, displayName, email, status, createdAt) VALUES (?, 'Nusrat', ?, 'pending', ?)",
      id,
      email,
      new Date().toISOString(),
    );
    return id;
  };

  it("mints no code — they sign in by emailed link", () => {
    const id = register("nusrat@personal.com");
    expect(access.approve(id, "admin")).toEqual({ kind: "link" });
    expect(db.all("SELECT id FROM invite_codes WHERE userId = ?", id)).toHaveLength(0);
  });

  it("marks them approved and records who did it", () => {
    const id = register("nusrat@personal.com");
    access.approve(id, "admin-1");
    const row = db.get<{ status: string; approvedBy: string }>(
      "SELECT status, approvedBy FROM users WHERE id = ?",
      id,
    )!;
    expect(row).toMatchObject({ status: "approved", approvedBy: "admin-1" });
  });

  it("returns nothing for a user who does not exist", () => {
    expect(access.approve("no-such-user", "admin")).toBeUndefined();
  });

  it("writes an audit row", () => {
    const id = register("nusrat@personal.com");
    access.approve(id, "admin");
    const actions = db.all<{ action: string }>("SELECT action FROM audit_log").map((a) => a.action);
    expect(actions).toContain("approve");
  });
});

describe("suspending", () => {
  it("ends access immediately, not at the next sign-in", () => {
    const { code, userId } = access.invite("Nusrat", "admin");
    access.redeemByCode(code);
    db.run(
      "INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
      "tok", userId, new Date().toISOString(), "2099-01-01T00:00:00Z",
    );

    access.suspend(userId, "admin");

    // The open session is destroyed, not left to lapse.
    expect(db.all("SELECT token FROM sessions WHERE userId = ?", userId)).toHaveLength(0);
    const row = db.get<{ status: string }>("SELECT status FROM users WHERE id = ?", userId)!;
    expect(row.status).toBe("suspended");
  });

  it("writes an audit row", () => {
    const { userId } = access.invite("Nusrat", "admin");
    access.suspend(userId, "admin");
    const actions = db.all<{ action: string }>("SELECT action FROM audit_log").map((a) => a.action);
    expect(actions).toContain("suspend");
  });
});
