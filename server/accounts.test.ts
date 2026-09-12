import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db.js";
import { dropIfCreated, freshDb, hasPostgres, type TestDb } from "./test-db.js";
import { Access } from "./access.js";
import { MagicLinks } from "./magic-link.js";
import { Accounts, isWorkAddress, parseBlockedDomains } from "./accounts.js";

let handle: TestDb;
let db: Db;
let accounts: Accounts;

beforeEach(async () => {
  handle = await freshDb();
  db = handle.db;
  accounts = new Accounts(db, ["giz.de"], "ruman@personal.com");
});
afterEach(async () => {
  await dropIfCreated(handle);
});

const good = {
  email: "nusrat.personal@gmail.com",
  displayName: "Nusrat",
};

describe.skipIf(!hasPostgres)("work addresses are refused on purpose", () => {
  it("blocks the employer domain and says why", async () => {
    // A work address identifies a person AND their employer, and ties their
    // daily movements to both. Keeping it out is the point, not an oversight.
    const r = await accounts.register({ ...good, email: "nusrat@giz.de" });
    expect(r.ok).toBe(false);
    expect(r.workAddress).toBe(true);
    expect(r.message).toContain("personal email");
  });

  it("blocks a subdomain of it too", async () => {
    expect((await accounts.register({ ...good, email: "n@mail.giz.de" })).ok).toBe(false);
  });

  it("does not block a lookalike that merely ends the same way", async () => {
    expect(isWorkAddress("someone@notgiz.de", ["giz.de"])).toBe(false);
  });

  it("reads the blocked list with or without the @", async () => {
    expect(parseBlockedDomains("@giz.de, Example.Org")).toEqual(["giz.de", "example.org"]);
    expect(parseBlockedDomains(undefined)).toEqual([]);
  });
});

describe.skipIf(!hasPostgres)("registering", () => {
  it("accepts a personal address and leaves the colleague pending", async () => {
    expect((await accounts.register(good)).ok).toBe(true);
    expect((await accounts.pending()).map((p) => p.email)).toEqual(["nusrat.personal@gmail.com"]);
  });

  it("keeps the optional details for the administrator to recognise them by", async () => {
    await accounts.register({ ...good, officialName: "Nusrat Jahan", department: "Programmes" });
    expect((await accounts.pending())[0]).toMatchObject({
      officialName: "Nusrat Jahan",
      department: "Programmes",
    });
  });

  it("lets a colleague leave the optional details blank", async () => {
    // Optional means optional: they are approved on the strength of their name.
    expect((await accounts.register(good)).ok).toBe(true);
    expect((await accounts.pending())[0]).toMatchObject({ officialName: null, department: null });
  });

  it("refuses a malformed address or a missing name", async () => {
    expect((await accounts.register({ ...good, email: "not-an-email" })).ok).toBe(false);
    expect((await accounts.register({ ...good, displayName: "  " })).ok).toBe(false);
  });

  it("answers a duplicate identically, so the form cannot reveal who signed up", async () => {
    const first = await accounts.register(good);
    const second = await accounts.register(good);
    expect(second.message).toBe(first.message);
    expect(await accounts.pending()).toHaveLength(1);
  });

  it("stores no credential at all", async () => {
    // There is nothing to hash any more. Whatever admits somebody lives in
    // login_links, hashed there, and expires in twenty minutes.
    await accounts.register(good);
    const row = await db.get<{ passwordHash: string | null; passwordSalt: string | null }>(
      "SELECT passwordHash, passwordSalt FROM users",
    )!;
    expect(row).toEqual({ passwordHash: null, passwordSalt: null });
  });
});


describe.skipIf(!hasPostgres)("the administrator", () => {
  it("registers like everybody else and is approved immediately", async () => {
    // Seeding an admin row instead is how an earlier version locked the
    // administrator out of their own pilot.
    const r = await accounts.register({ ...good, email: "ruman@personal.com" });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("administrator");
    expect(await accounts.pending()).toHaveLength(0);

    const row = await db.get<{ role: string; status: string }>(
      "SELECT role, status FROM users WHERE email = 'ruman@personal.com'",
    )!;
    expect(row).toEqual({ role: "admin", status: "approved" });
  });

  it("gives nobody else the admin role", async () => {
    await accounts.register(good);
    const row = await db.get<{ role: string }>("SELECT role FROM users WHERE email = ?", good.email)!;
    expect(row.role).toBe("member");
  });

  it("still refuses a work address, even for the administrator", async () => {
    const admin = new Accounts(db, ["giz.de"], "ruman@giz.de");
    const r = await admin.register({ ...good, email: "ruman@giz.de" });
    expect(r.ok).toBe(false);
    // Named as a configuration mistake, so whoever started the server knows to
    // change ADMIN_EMAIL rather than concluding the app is broken.
    expect(r.message).toContain("ADMIN_EMAIL");
  });
});

describe.skipIf(!hasPostgres)("approving somebody who registered themselves", () => {
  it("mints a code, because email is not dependable", async () => {
    await accounts.register(good);
    const id = (await accounts.pending())[0]!.id;

    const issued = await new Access(db).approve(id, "admin");

    expect(issued?.kind).toBe("code");
    expect(await db.all("SELECT id FROM invite_codes WHERE userId = ?", id)).toHaveLength(1);
    // And a sign-in link still works, for wherever email is available.
    expect(await new MagicLinks(db).request(good.email)).toBeDefined();
  });
});

