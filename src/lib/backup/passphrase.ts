/**
 * Passphrase rules and the strength hint for encrypted backups. Pure.
 *
 * The strength hint is deliberately simple and makes no entropy claim: a
 * backup file can be attacked offline with no rate limit, so what actually
 * protects it is length, and the bands below are length bands. They are a
 * first draft, not a measured policy (see "Open items" in CLAUDE.md).
 *
 * Known limitation, left on purpose: this measures length, not guessability.
 * Character classes (letters, digits, symbols) are deliberately ignored, since
 * composition rules reward predictable tricks like "Password1!", and the only
 * variety check is the distinct-character guard below. So a long predictable
 * passphrase ("passwordpasswordpassword", "1234567890123456") rates "Strong".
 * Encrypted backups are optional and this is a hint, not a gate; if it ever
 * needs to be smarter, the options were cheap pattern checks (repeated chunks,
 * sequences, a short common-passwords list) or a real estimator such as zxcvbn
 * loaded only when the checkbox is ticked. Pinned in tests/passphrase.test.ts.
 */

/** The shortest passphrase accepted for a new encrypted backup. */
export const MIN_PASSPHRASE_LENGTH = 8;

/** Below this many distinct characters ("aaaaaaaaaa") a long passphrase is still weak. */
const MIN_DISTINCT_CHARACTERS = 5;

export type PassphraseStrength = "too_short" | "fair" | "good" | "strong";

export const STRENGTH_LABEL: Record<PassphraseStrength, string> = {
  too_short: "Too short",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

/** How many of the three bar segments each level fills. */
export const STRENGTH_SEGMENTS: Record<PassphraseStrength, number> = {
  too_short: 0,
  fair: 1,
  good: 2,
  strong: 3,
};

/**
 * The same passphrase typed on a phone and on a laptop can differ in how an
 * accented letter is encoded (composed vs decomposed), which would derive a
 * different key. NFKC makes them identical. Not trimmed and not case-folded:
 * both would quietly change what the athlete typed.
 */
export function normalizePassphrase(passphrase: string): string {
  return passphrase.normalize("NFKC");
}

export function passphraseStrength(passphrase: string): PassphraseStrength {
  const chars = [...normalizePassphrase(passphrase)];
  if (chars.length < MIN_PASSPHRASE_LENGTH) return "too_short";
  const distinct = new Set(chars).size;
  if (distinct < MIN_DISTINCT_CHARACTERS) return "fair";
  if (chars.length >= 16) return "strong";
  if (chars.length >= 12) return "good";
  return "fair";
}

export type PassphraseProblem = "too_short" | "mismatch";

/** What stops a new passphrase from being used, or null when it is fine. */
export function passphraseProblem(passphrase: string, confirmation: string): PassphraseProblem | null {
  if ([...normalizePassphrase(passphrase)].length < MIN_PASSPHRASE_LENGTH) return "too_short";
  if (normalizePassphrase(passphrase) !== normalizePassphrase(confirmation)) return "mismatch";
  return null;
}
