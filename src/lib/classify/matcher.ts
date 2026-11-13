/**
 * The single text-matching engine shared by BOTH classifiers — the GPP domain
 * keywords and the M/W/G movement lexicon. Having one engine is the point: a
 * fix or a quirk in one classifier is a fix or a quirk in the other, rather
 * than two sets of ad-hoc matching logic drifting apart.
 *
 * ---------------------------------------------------------------------------
 * WHY SUBSTRING AND NOT WORD BOUNDARIES
 * ---------------------------------------------------------------------------
 * SugarWOD descriptions concatenate lines with no separator at all. Real
 * exports contain text like:
 *
 *     "21-15-9DeadliftsPull-ups-200m run after each round"
 *     "...25 burpeeswall-ball shots..."
 *     "5 rounds:20 squatshandstand walk"
 *
 * so the character immediately before a genuine match is very often a letter.
 * A \b or leading-letter-boundary rule reads all of those as non-matches and
 * silently drops the tag. Measured on the 1,209-row validation export, a
 * blanket left-letter-boundary rule loses 23 legitimate domain tags and gains
 * nothing. Plain substring matching is correct for this data.
 *
 * The cost of substring matching is a small number of genuine false positives
 * ("carry" inside "carryover"), which `exclude` handles surgically — see
 * domainKeywords.ts for the measured list.
 *
 * ---------------------------------------------------------------------------
 * INFLECTION
 * ---------------------------------------------------------------------------
 * Substring matching already covers every inflection that simply APPENDS to
 * the keyword: run/runs/running, press/presses, burpee/burpees, carry/carrying.
 * The one class it cannot reach is where the stem itself changes, and English
 * has essentially one such rule in play here — a consonant followed by "y"
 * becomes "i" before a suffix:
 *
 *     carry  -> carries, carried        heavy -> heavier, heaviest
 *
 * So rather than hand-adding "carries" to keyword lists one word at a time —
 * which fixes this export and not the next athlete's — every rule also matches
 * on its "...i" stem. Measured against the 1,209-row sample, the stems land
 * only on genuine inflections (carries, carriesas, heavier, heaviest) and
 * nothing spurious.
 *
 * ---------------------------------------------------------------------------
 * PERCENTAGE BASES (the movement classifier only)
 * ---------------------------------------------------------------------------
 * "Back squat 5x5 at 75% of your clean" names the clean only as the number the load is a
 * percentage of; nobody cleans in that workout. So with `skipPercentBases`, an occurrence
 * directly after "% of" (and the few words that can sit between, "your", "1RM", "5-rep max")
 * is a reference, not a performed movement. It is not blanket: the same lift named anywhere
 * else in the text still matches, and "75% back squat" with no "of" is left alone, because
 * there the lift is as likely to be the one being performed. A reference is claimed as a
 * whole phrase (`findPercentBases`), so "% of clean and jerk" cannot be re-read as "jerk".
 * The GPP domain keywords do NOT use this: they have no claiming, so rejecting "clean and
 * jerk" would let the keyword "jerk" match inside it, and the parity fixture pins them.
 * That leaves the domain tags as they were, pinned in tests/domainClassifier.test.ts.
 * ---------------------------------------------------------------------------
 */

export type MatchMode = "substring" | "token";

export interface MatchRule {
  /** The phrase to look for. MUST be lowercase; `text` is lowercased too. */
  phrase: string;
  /**
   * "substring" (default) — plain containment, tolerant of glued words.
   * "token" — for short abbreviations like "du" or "kb", where no exclusion
   *   list could ever be complete. Requires a non-letter (or string edge) to
   *   the left, and allows only an optional trailing "s" to the right.
   *   "50du" and "dus" match; "double" and "individual" do not.
   */
  mode?: MatchMode;
  /**
   * Longer strings that must not be what produced the match. An occurrence is
   * rejected when it falls inside an occurrence of one of these.
   * e.g. phrase "carry" with exclude ["carryover"].
   */
  exclude?: readonly string[];
}

/** Half-open [start, end) character range of a match. */
export type MatchRange = readonly [start: number, end: number];

const isLetter = (ch: string | undefined): boolean =>
  ch !== undefined && ch >= "a" && ch <= "z";

const isVowel = (ch: string): boolean => "aeiou".includes(ch);

/**
 * The forms a rule searches for: the phrase itself, plus its consonant+y -> i
 * stem when it has one. "carry" also searches "carri"; "run" and "wall ball"
 * search only themselves.
 *
 * Returns the stem WITHOUT a trailing "y", so plain substring matching then
 * picks up carries/carried/carrier on its own.
 */
export function searchForms(phrase: string): string[] {
  const penultimate = phrase.at(-2);
  if (
    phrase.length > 2 &&
    phrase.endsWith("y") &&
    penultimate !== undefined &&
    isLetter(penultimate) &&
    !isVowel(penultimate)
  ) {
    return [phrase, `${phrase.slice(0, -1)}i`];
  }
  return [phrase];
}

/**
 * What may sit between "% of" and the thing it is a percentage of: your, my, the, today's, a rep max.
 * Anchored to the end of the text before a candidate, so only what is directly in front of it counts.
 */
const PERCENT_BASE_LEAD =
  /(?:%|percent)\s*of\s+(?:(?:your|my|the|todays?|today's|max|\d+\s*-?\s*rm|\d+\s*-?\s*rep\s*-?\s*max)\s+)*$/;

/** True when the occurrence at `at` is only the base of a percentage ("75% of snatch"). */
function followsPercentOf(text: string, at: number): boolean {
  return PERCENT_BASE_LEAD.test(text.slice(Math.max(0, at - 48), at));
}

/** Every range in `text` covered by any of the exclusion strings. */
function excludedRanges(text: string, exclude: readonly string[]): MatchRange[] {
  const ranges: MatchRange[] = [];
  for (const ex of exclude) {
    if (ex === "") continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(ex, from);
      if (at === -1) break;
      ranges.push([at, at + ex.length]);
      from = at + 1;
    }
  }
  return ranges;
}

/** True when [start,end) sits inside any excluded range. */
function isExcluded(start: number, end: number, ranges: readonly MatchRange[]): boolean {
  return ranges.some(([exStart, exEnd]) => start >= exStart && end <= exEnd);
}

/**
 * In "token" mode, a candidate occurrence is only a real match when it is
 * delimited on the left by a non-letter and on the right by a non-letter,
 * optionally allowing a single trailing "s" (plural).
 */
function tokenBoundariesOk(text: string, start: number, end: number): boolean {
  if (isLetter(text[start - 1])) return false;
  if (!isLetter(text[end])) return true;
  // Allow exactly one trailing "s", provided nothing letter-ish follows it.
  return text[end] === "s" && !isLetter(text[end + 1]);
}

/**
 * All non-overlapping occurrences of `rule` in `text`, left to right.
 * `text` must already be lowercased.
 */
export function findAllMatches(
  text: string,
  rule: MatchRule,
  options: { skipPercentBases?: boolean } = {}
): MatchRange[] {
  return scan(text, rule, options.skipPercentBases ?? false).found;
}

/**
 * The occurrences of `rule` that were rejected only because they are the base of a percentage
 * ("75% of snatch"). The movement classifier claims these ranges so a shorter phrase inside one
 * ("jerk" in "% of clean and jerk") cannot match in its place. Non-overlapping, left to right.
 */
export function findPercentBases(text: string, rule: MatchRule): MatchRange[] {
  return scan(text, rule, true).bases;
}

function scan(text: string, rule: MatchRule, skipPercentBases: boolean): { found: MatchRange[]; bases: MatchRange[] } {
  if (rule.phrase === "") return { found: [], bases: [] };

  const mode = rule.mode ?? "substring";
  const exclusions = rule.exclude ? excludedRanges(text, rule.exclude) : [];
  const found: MatchRange[] = [];
  const bases: MatchRange[] = [];

  for (const form of searchForms(rule.phrase)) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(form, from);
      if (at === -1) break;
      const end = at + form.length;

      const ok =
        !isExcluded(at, end, exclusions) &&
        (mode === "substring" || tokenBoundariesOk(text, at, end));

      if (ok && skipPercentBases && followsPercentOf(text, at)) {
        bases.push([at, end]);
        from = end;
      } else if (ok) {
        found.push([at, end]);
        from = end; // non-overlapping within this form
      } else {
        from = at + 1;
      }
    }
  }

  // A phrase and its stem can both land on the same text ("carry"/"carri"
  // inside "carrying"), so drop overlaps and report left to right.
  return { found: dedupe(found), bases: dedupe(bases) };
}

function dedupe(ranges: MatchRange[]): MatchRange[] {
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: MatchRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] < last[1]) continue;
    merged.push(range);
  }
  return merged;
}

/** Index of the first real match, or -1. `text` must be lowercased. */
export function findMatch(text: string, rule: MatchRule): number {
  if (rule.phrase === "") return -1;

  const mode = rule.mode ?? "substring";
  const exclusions = rule.exclude ? excludedRanges(text, rule.exclude) : [];
  let earliest = -1;

  for (const form of searchForms(rule.phrase)) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(form, from);
      if (at === -1) break;
      const end = at + form.length;
      if (
        !isExcluded(at, end, exclusions) &&
        (mode === "substring" || tokenBoundariesOk(text, at, end))
      ) {
        if (earliest === -1 || at < earliest) earliest = at;
        break;
      }
      from = at + 1;
    }
  }
  return earliest;
}

/** Whether `rule` matches anywhere in `text`. `text` must be lowercased. */
export function matches(text: string, rule: MatchRule): boolean {
  return findMatch(text, rule) !== -1;
}

/**
 * The text a classifier reads: title + description + barbell_lift, lowercased.
 * Both classifiers use exactly this, so they always see the same input.
 */
export function classifiableText(fields: {
  title?: string | null;
  description?: string | null;
  barbell_lift?: string | null;
}): string {
  return `${fields.title ?? ""} ${fields.description ?? ""} ${fields.barbell_lift ?? ""}`.toLowerCase();
}
