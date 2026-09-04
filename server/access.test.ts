import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db } from "./db.js";
import {
  Access,
  CODE_VALID_DAYS,
  NOT_IN_ORGANISATION,
  MAX_REQUESTS_PER_HOUR,
  emailIsAllowed,
  generateCode,
  parseAllowedDomains,
} from "./access.js";

/**
 * The security boundary of the pilot.
 *
 * A public URL with private access is only as good as these gates, so they are
 * tested against a real database rather than a mock.
 */
let dir: string;
let db: Db;
let access: Access;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ekpothe-"));
  db = new Db(join(dir, "t.db"));
  access = new Access(db, {
    allowedDomains: ["example.org"],
    autoApproveDomains: [],
    canSendEmail: false,
    ipPepper: "test-pepper",
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("parseAllowedDomains", () => {
  it("reads a comma-separated list, with or without the @", () => {
    expect(parseAllowedDomains("@example.org, Partner.Org ")).toEqual(["example.org", "partner.org"]);
  });

  it("is empty when unset, which locks everybody out rather than letting all in", () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(emailIsAllowed("anyone@anywhere.com", [])).toBe(false);
  });
});

describe("emailIsAllowed", () => {
  const domains = ["example.org"];

  it("admits a work address and a subdomain of it", () => {
    expect(emailIsAllowed("nusrat@example.org", domains)).toBe(true);
    expect(emailIsAllowed("nusrat@dhaka.example.org", domains)).toBe(true);
  });

  it("refuses a personal address — the colleague's brother stops here", () => {
    expect(emailIsAllowed("someone@gmail.com", domains)).toBe(false);
  });

  it("refuses a lookalike domain that merely ends the same way", () => {
    // A suffix match would let notexample.org through.
    expect(emailIsAllowed("attacker@notexample.org", domains)).toBe(false);
    expect(emailIsAllowed("attacker@example.org.evil.com", domains)).toBe(false);
  });

  it("refuses malformed input rather than guessing", () => {
    for (const bad of ["", "no-at-sign", "@example.org", "a@", "a@@example.org"]) {
      expect(emailIsAllowed(bad, domains), bad).toBe(false);
    }
  });
});

describe("requesting access", () => {
  it("accepts a work address and leaves the colleague pending", () => {
    const r = access.request("nusrat@example.org", "Nusrat Jahan", "1.2.3.4");
    expect(r.ok).toBe(true);
    expect(access.pending().map((p) => p.email)).toEqual(["nusrat@example.org"]);
  });

  it("tells an outside address it is out of scope, in the organisation's own words", () => {
    const r = access.request("someone@gmail.com", "Someone", "1.2.3.4");
    expect(r.ok).toBe(false);
    expect(r.message).toBe(NOT_IN_ORGANISATION);
    expect(r.outsideOrganisation).toBe(true);
    expect(access.pending()).toHaveLength(0);
  });

  it("answers a duplicate identically, so the form cannot reveal who works here", () => {
    const first = access.request("nusrat@example.org", "Nusrat", "1.2.3.4");
    const second = access.request("nusrat@example.org", "Nusrat", "5.6.7.8");
    expect(second.message).toBe(first.message);
    expect(access.pending()).toHaveLength(1);
  });

  it("stops replying to a flood from one address", () => {
    for (let i = 0; i < MAX_REQUESTS_PER_HOUR; i += 1) {
      access.request(`p${i}@example.org`, "P", "9.9.9.9");
    }
    access.request("extra@example.org", "Extra", "9.9.9.9");
    expect(access.pending()).toHaveLength(MAX_REQUESTS_PER_HOUR);
    // A different address is unaffected.
    access.request("other@example.org", "Other", "8.8.8.8");
    expect(access.pending()).toHaveLength(MAX_REQUESTS_PER_HOUR + 1);
  });
});

describe("approving and redeeming", () => {
  const ask = (email = "nusrat@example.org") => {
    access.request(email, "Nusrat Jahan", "1.2.3.4");
    return access.pending().find((p) => p.email === email)!.id;
  };

  it("issues a readable code that admits the colleague once", () => {
    const id = ask();
    const issued = access.approve(id, "admin")!;
    expect(issued.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(access.redeem("nusrat@example.org", issued.code)).toBe(id);
  });

  it("consumes the code, so a forwarded code is useless", () => {
    const id = ask();
    const { code } = access.approve(id, "admin")!;
    expect(access.redeem("nusrat@example.org", code)).toBe(id);
    expect(access.redeem("nusrat@example.org", code)).toBeUndefined();
  });

  it("binds the code to one email — it does not work for anybody else", () => {
    const id = ask();
    const other = ask("tanvir@example.org");
    const { code } = access.approve(id, "admin")!;
    access.approve(other, "admin");
    expect(access.redeem("tanvir@example.org", code)).toBeUndefined();
    expect(access.redeem("nusrat@example.org", code)).toBe(id);
  });

  it("is case-insensitive on the code, because people retype what they were told", () => {
    const id = ask();
    const { code } = access.approve(id, "admin")!;
    expect(access.redeem("NUSRAT@example.org", code.toLowerCase())).toBe(id);
  });

  it("refuses a wrong code", () => {
    const id = ask();
    access.approve(id, "admin");
    expect(access.redeem("nusrat@example.org", "AAAAAA")).toBeUndefined();
  });

  it("refuses anyone still pending, however the code was obtained", () => {
    const id = ask();
    const { code } = access.approve(id, "admin")!;
    db.run("UPDATE users SET status = 'pending' WHERE id = ?", id);
    expect(access.redeem("nusrat@example.org", code)).toBeUndefined();
  });

  it("invalidates an earlier unused code when re-approving", () => {
    const id = ask();
    const first = access.approve(id, "admin")!;
    const second = access.approve(id, "admin")!;
    expect(access.redeem("nusrat@example.org", first.code)).toBeUndefined();
    expect(access.redeem("nusrat@example.org", second.code)).toBe(id);
  });

  it("stores only a hash — a copy of the database hands nobody a working code", () => {
    const id = ask();
    const { code } = access.approve(id, "admin")!;
    const rows = db.all<{ codeHash: string }>("SELECT codeHash FROM invite_codes");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code);
    expect(rows[0]!.codeHash).toHaveLength(64);
  });

  it("expires a code after a week", () => {
    const id = ask();
    const { code } = access.approve(id, "admin")!;
    db.run(
      "UPDATE invite_codes SET expiresAt = ? WHERE userId = ?",
      new Date(Date.now() - 1000).toISOString(),
      id,
    );
    expect(access.redeem("nusrat@example.org", code)).toBeUndefined();
    expect(CODE_VALID_DAYS).toBe(7);
  });

  it("writes an audit row for the approval and the redemption", () => {
    const id = ask();
    const { code } = access.approve(id, "admin")!;
    access.redeem("nusrat@example.org", code);
    const actions = db.all<{ action: string }>("SELECT action FROM audit_log").map((a) => a.action);
    expect(actions).toContain("approve");
    expect(actions).toContain("redeem-code");
  });
});

describe("suspending", () => {
  it("ends access immediately, not at the next sign-in", () => {
    access.request("nusrat@example.org", "Nusrat", "1.2.3.4");
    const id = access.pending()[0]!.id;
    const { code } = access.approve(id, "admin")!;
    access.redeem("nusrat@example.org", code);
    db.run(
      "INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
      "tok", id, new Date().toISOString(), "2099-01-01T00:00:00Z",
    );

    access.suspend(id, "admin");
    expect(db.all("SELECT token FROM sessions WHERE userId = ?", id)).toHaveLength(0);
  });
});

describe("generateCode", () => {
  it("avoids characters people confuse when reading a code aloud", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).not.toMatch(/[O0I1]/);
    }
  });
});


describe("automatic approval", () => {
  const withEmail = (canSendEmail: boolean) =>
    new Access(db, {
      allowedDomains: ["giz.de"],
      autoApproveDomains: ["giz.de"],
      canSendEmail,
      ipPepper: "test-pepper",
    });

  it("approves and issues a code when the code can be emailed", () => {
    // Receiving the code is what proves the mailbox belongs to whoever asked.
    const a = withEmail(true);
    const r = a.request("nusrat@giz.de", "Nusrat Jahan", "1.2.3.4");
    expect(r.ok).toBe(true);
    expect(r.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(a.pending()).toHaveLength(0);
    expect(a.redeem("nusrat@giz.de", r.code!)).toBe(r.userId);
  });

  it("refuses to auto-approve when no code can be sent", () => {
    // Otherwise a domain check is a claim, not a proof: anybody can type an
    // address at the allowed domain and walk in.
    const a = withEmail(false);
    const r = a.request("stranger@giz.de", "Stranger", "1.2.3.4");
    expect(r.code).toBeUndefined();
    expect(a.pending()).toHaveLength(1);
  });

  it("still refuses an outside domain, even with email working", () => {
    const a = withEmail(true);
    const r = a.request("someone@gmail.com", "Someone", "1.2.3.4");
    expect(r.ok).toBe(false);
    expect(r.message).toBe(NOT_IN_ORGANISATION);
  });

  it("reissues to somebody who lost their code, invalidating the old one", () => {
    const a = withEmail(true);
    const first = a.request("nusrat@giz.de", "Nusrat", "1.2.3.4");
    const second = a.request("nusrat@giz.de", "Nusrat", "1.2.3.4");
    expect(second.code).toBeDefined();
    expect(second.code).not.toBe(first.code);
    expect(a.redeem("nusrat@giz.de", first.code!)).toBeUndefined();
    expect(a.redeem("nusrat@giz.de", second.code!)).toBe(first.userId);
  });

  it("does not auto-approve a domain that is allowed but not listed for it", () => {
    const a = new Access(db, {
      allowedDomains: ["giz.de", "partner.org"],
      autoApproveDomains: ["giz.de"],
      canSendEmail: true,
      ipPepper: "test-pepper",
    });
    expect(a.request("colleague@partner.org", "P", "1.2.3.4").code).toBeUndefined();
    expect(a.pending().map((p) => p.email)).toEqual(["colleague@partner.org"]);
  });
});
