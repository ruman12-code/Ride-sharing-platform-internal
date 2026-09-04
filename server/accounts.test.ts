import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db } from "./db.js";
import {
  Accounts,
  MIN_PASSWORD_LENGTH,
  isWorkAddress,
  parseBlockedDomains,
} from "./accounts.js";

let dir: string;
let db: Db;
let accounts: Accounts;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ekpothe-acc-"));
  db = new Db(join(dir, "t.db"));
  accounts = new Accounts(db, ["giz.de"]);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const good = {
  email: "nusrat.personal@gmail.com",
  password: "a-good-passphrase",
  displayName: "Nusrat",
};

describe("work addresses are refused on purpose", () => {
  it("blocks the employer domain and says why", () => {
    // A work address identifies a person AND their employer, and ties their
    // daily movements to both. Keeping it out is the point, not an oversight.
    const r = accounts.register({ ...good, email: "nusrat@giz.de" });
    expect(r.ok).toBe(false);
    expect(r.workAddress).toBe(true);
    expect(r.message).toContain("personal email");
  });

  it("blocks a subdomain of it too", () => {
    expect(accounts.register({ ...good, email: "n@mail.giz.de" }).ok).toBe(false);
  });

  it("does not block a lookalike that merely ends the same way", () => {
    expect(isWorkAddress("someone@notgiz.de", ["giz.de"])).toBe(false);
  });

  it("reads the blocked list with or without the @", () => {
    expect(parseBlockedDomains("@giz.de, Example.Org")).toEqual(["giz.de", "example.org"]);
    expect(parseBlockedDomains(undefined)).toEqual([]);
  });
});

describe("registering", () => {
  it("accepts a personal address and leaves the colleague pending", () => {
    expect(accounts.register(good).ok).toBe(true);
    expect(accounts.pending().map((p) => p.email)).toEqual(["nusrat.personal@gmail.com"]);
  });

  it("keeps the optional details for the administrator to recognise them by", () => {
    accounts.register({ ...good, officialName: "Nusrat Jahan", department: "Programmes" });
    expect(accounts.pending()[0]).toMatchObject({
      officialName: "Nusrat Jahan",
      department: "Programmes",
    });
  });

  it("lets a colleague leave the optional details blank", () => {
    // Optional means optional: they are approved on the strength of their name.
    expect(accounts.register(good).ok).toBe(true);
    expect(accounts.pending()[0]).toMatchObject({ officialName: null, department: null });
  });

  it("refuses a short password", () => {
    const r = accounts.register({ ...good, password: "short" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("refuses a malformed address or a missing name", () => {
    expect(accounts.register({ ...good, email: "not-an-email" }).ok).toBe(false);
    expect(accounts.register({ ...good, displayName: "  " }).ok).toBe(false);
  });

  it("answers a duplicate identically, so the form cannot reveal who signed up", () => {
    const first = accounts.register(good);
    const second = accounts.register(good);
    expect(second.message).toBe(first.message);
    expect(accounts.pending()).toHaveLength(1);
  });

  it("never stores the password itself", () => {
    accounts.register(good);
    const row = db.get<{ passwordHash: string }>("SELECT passwordHash FROM users")!;
    expect(row.passwordHash).not.toContain(good.password);
    expect(row.passwordHash).toHaveLength(64);
  });

  it("salts each password separately, so identical ones hash differently", () => {
    accounts.register(good);
    accounts.register({ ...good, email: "other@gmail.com" });
    const rows = db.all<{ passwordHash: string }>("SELECT passwordHash FROM users");
    expect(rows[0]!.passwordHash).not.toBe(rows[1]!.passwordHash);
  });
});

describe("signing in", () => {
  const approve = () => {
    accounts.register(good);
    const id = accounts.pending()[0]!.id;
    db.run("UPDATE users SET status = 'approved' WHERE id = ?", id);
    return id;
  };

  it("admits an approved colleague", () => {
    const id = approve();
    expect(accounts.signIn(good.email, good.password)).toEqual({ userId: id });
  });

  it("is case-insensitive on the address", () => {
    const id = approve();
    expect(accounts.signIn("Nusrat.Personal@Gmail.com", good.password)).toEqual({ userId: id });
  });

  it("tells somebody still pending that they are waiting, not that they are wrong", () => {
    accounts.register(good);
    const r = accounts.signIn(good.email, good.password);
    expect("error" in r && r.error).toContain("waiting for approval");
  });

  it("refuses a suspended account", () => {
    const id = approve();
    db.run("UPDATE users SET isSuspended = 1 WHERE id = ?", id);
    expect("error" in accounts.signIn(good.email, good.password)).toBe(true);
  });

  it("gives the same answer for a wrong password and an unknown address", () => {
    approve();
    const wrongPassword = accounts.signIn(good.email, "not-the-password");
    const unknown = accounts.signIn("nobody@gmail.com", "anything-at-all");
    // Otherwise sign-in becomes a way of discovering who is registered.
    expect(wrongPassword).toEqual(unknown);
  });

  it("refuses an account that has no password set", () => {
    // Invite-mode rows have none; a password sign-in must not admit them.
    db.run(
      "INSERT INTO users (id, displayName, email, status, createdAt) VALUES ('u1','X','x@gmail.com','approved','now')",
    );
    expect("error" in accounts.signIn("x@gmail.com", "")).toBe(true);
  });
});
