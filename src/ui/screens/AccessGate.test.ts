import { describe, expect, it } from "vitest";
import { normaliseCode } from "./AccessGate.jsx";

/**
 * The code box is the only door that always opens: no mail provider, no host's
 * SMTP policy, nothing but a string the administrator reads off their screen.
 *
 * It failed anyway, and failed in the quietest possible way. The field folded
 * whatever it held to upper case while that was six characters or shorter, so
 * every code had its first six characters rewritten as it was typed. A
 * colleague's invite code survives that — it is six upper-case characters
 * already. The administrator's own bootstrap code does not: `open-sesame-4471`
 * arrives as `OPEN-Sesame-4471`, the right length and the wrong bytes, and the
 * server can only say that it is not valid.
 *
 * These tests exist because that expression used to live inside a JSX
 * attribute, where nothing could reach it.
 */
describe("normalising a typed code", () => {
  it("folds a six-character invite code, so it can be typed in lower case", () => {
    // Minted from an upper-case alphabet, so folding cannot lose anything.
    expect(normaliseCode("k7pq2m")).toBe("K7PQ2M");
    expect(normaliseCode("K7PQ2M")).toBe("K7PQ2M");
  });

  it("leaves a longer code exactly as typed — the regression", () => {
    // The whole bug in one line. Anything that folds this is broken again.
    expect(normaliseCode("open-sesame-4471")).toBe("open-sesame-4471");
    expect(normaliseCode("MixedCasePassphrase")).toBe("MixedCasePassphrase");
  });

  it("does not fold the leading characters of a longer code", () => {
    // The precise shape of the old failure: seven characters, of which the
    // first six were rewritten.
    expect(normaliseCode("abcdefg")).toBe("abcdefg");
  });

  it("trims, because a phone keyboard appends a space to a long code", () => {
    // Length is what decides whether the bootstrap code is compared at all, so
    // one invisible character was enough to make the guaranteed door refuse.
    expect(normaliseCode("  open-sesame-4471 ")).toBe("open-sesame-4471");
    expect(normaliseCode(" k7pq2m ")).toBe("K7PQ2M");
  });

  it("counts characters after trimming, not before", () => {
    // " k7pq2m " is eight characters and an invite code all the same.
    expect(normaliseCode(" k7pq2m ")).toHaveLength(6);
  });

  it("passes an empty box through rather than inventing a code", () => {
    expect(normaliseCode("   ")).toBe("");
  });
});
