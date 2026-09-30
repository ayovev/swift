import { describe, expect, it } from "vitest";
import {
  MIN_PASSPHRASE_LENGTH,
  normalizePassphrase,
  passphraseProblem,
  passphraseStrength,
} from "@/lib/backup/passphrase";

describe("passphraseStrength", () => {
  it.each([
    ["", "too_short"],
    ["1234567", "too_short"],
    ["abcd1234", "fair"],
    ["abcdefghijk", "fair"],
    ["correct horse", "good"],
    ["correct horse battery", "strong"],
    ["aaaaaaaaaaaaaaaaaaaa", "fair"], // long, but only one distinct character
    ["abababababababababab", "fair"], // two distinct characters
  ])("rates %j as %s", (passphrase, expected) => {
    expect(passphraseStrength(passphrase)).toBe(expected);
  });

  // Known limitation, pinned deliberately (see the header of passphrase.ts): the hint
  // measures length, so long predictable passphrases still rate "Strong". If this
  // ever changes, move these cases rather than deleting them.
  it.each([
    ["passwordpasswordpassword", "strong"],
    ["1234567890123456", "strong"],
    ["qwertyuiopasdfgh", "strong"],
  ])("rates the predictable %j as %s (length only)", (passphrase, expected) => {
    expect(passphraseStrength(passphrase)).toBe(expected);
  });

  it("does not care about character classes", () => {
    // Same length, one all-lowercase and one mixed with digits and symbols.
    expect(passphraseStrength("abcdefghijkl")).toBe(passphraseStrength("aB3$eF6&hI9*"));
  });

  it("counts characters, not UTF-16 units", () => {
    // Eight emoji are 16 code units but eight characters.
    expect(passphraseStrength("🏋️‍♀️".repeat(1))).toBe("too_short");
    expect(passphraseStrength("🏋🚴🏃🤸🧗🏊⛹🤾")).toBe("fair");
  });
});

describe("passphraseProblem", () => {
  it("names the first thing wrong", () => {
    expect(passphraseProblem("short", "short")).toBe("too_short");
    expect(passphraseProblem("long enough phrase", "long enough phrasE")).toBe("mismatch");
    expect(passphraseProblem("long enough phrase", "long enough phrase")).toBeNull();
  });

  it("requires the minimum length", () => {
    expect(passphraseProblem("a".repeat(MIN_PASSPHRASE_LENGTH - 1), "")).toBe("too_short");
    expect(passphraseProblem("a".repeat(MIN_PASSPHRASE_LENGTH), "a".repeat(MIN_PASSPHRASE_LENGTH))).toBeNull();
  });

  it("treats composed and decomposed accents as the same passphrase", () => {
    expect(passphraseProblem("café au lait", "café au lait")).toBeNull();
  });
});

describe("normalizePassphrase", () => {
  it("unifies composed and decomposed forms, and leaves case and spaces alone", () => {
    expect(normalizePassphrase("café")).toBe("café");
    expect(normalizePassphrase("  Mixed Case  ")).toBe("  Mixed Case  ");
  });
});
