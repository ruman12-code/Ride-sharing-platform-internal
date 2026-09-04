import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db } from "./db.js";
import { Access } from "./access.js";
import { MagicLinks } from "./magic-link.js";
import { Accounts, isWorkAddress, parseBlockedDomains } from "./accounts.js";

let dir: string;
let db: Db;
let accounts: Accounts;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ekpothe-acc-"));
  db = new Db(join(dir, "t.db"));
  accounts = new Accounts(db, ["giz.de"], "ruman@personal.com");
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const good = {
  email: "nusrat.personal@gmail.com",
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

  it("stores no credential at all", () => {
    // There is nothing to hash any more. Whatever admits somebody lives in
    // login_links, hashed there, and expires in twenty minutes.
    accounts.register(good);
    const row = db.get<{ passwordHash: string | null; passwordSalt: string | null }>(
      "SELECT passwordHash, passwordSalt FROM users",
    )!;
    expect(row).toEqual({ passwordHash: null, passwordSalt: null });
  });
});


describe("the administrator", () => {
  it("registers like everybody else and is approved immediately", () => {
    // Seeding an admin row instead is how an earlier version locked the
    // administrator out of their own pilot.
    const r = accounts.register({ ...good, email: "ruman@personal.com" });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("administrator");
    expect(accounts.pending()).toHaveLength(0);

    const row = db.get<{ role: string; status: string }>(
      "SELECT role, status FROM users WHERE email = 'ruman@personal.com'",
    )!;
    expect(row).toEqual({ role: "admin", status: "approved" });
  });

  it("gives nobody else the admin role", () => {
    accounts.register(good);
    const row = db.get<{ role: string }>("SELECT role FROM users WHERE email = ?", good.email)!;
    expect(row.role).toBe("member");
  });

  it("still refuses a work address, even for the administrator", () => {
    const admin = new Accounts(db, ["giz.de"], "ruman@giz.de");
    const r = admin.register({ ...good, email: "ruman@giz.de" });
    expect(r.ok).toBe(false);
    // Named as a configuration mistake, so whoever started the server knows to
    // change ADMIN_EMAIL rather than concluding the app is broken.
    expect(r.message).toContain("ADMIN_EMAIL");
  });
});

describe("approving somebody who registered themselves", () => {
  it("mints no code, because a link can reach the address they gave", () => {
    accounts.register(good);
    const id = accounts.pending()[0]!.id;

    const issued = new Access(db).approve(id, "admin");

    expect(issued).toEqual({ kind: "link" });
    expect(db.all("SELECT id FROM invite_codes WHERE userId = ?", id)).toHaveLength(0);
    // And a sign-in link can now be minted for them.
    expect(new MagicLinks(db).request(good.email)).toBeDefined();
  });
});

