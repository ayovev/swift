import { findAllMatches, type MatchRange, type MatchRule } from "./matcher";
import type { Implement } from "@/types/modality";

/**
 * Which implement a movement was done with, read from the words just before it
 * ("db snatches", "20 alternating kb swings", "single-db push jerks").
 *
 * This is deliberately NOT part of the movement lexicon. `db`, `kb`, `dumbbell` and
 * `kettlebell` name the implement, not the movement, and as lexicon entries they
 * counted as a movement of their own and inflated W (see movementLexicon.ts). Here
 * they only label a movement that was already found, so they never add one.
 *
 * Only an implement written directly before the movement counts: at most two plain
 * words between them, and nothing else. SugarWOD glues description lines together, so
 * a digit, a bracket or a punctuation mark means a different line and the implement
 * belongs to what came before, and so does one that is followed by another movement
 * ("dumbbell squatsbar-facing burpees" is a dumbbell squat, not a dumbbell burpee).
 * An implement named once for a list ("db: snatches, thrusters") is not carried
 * forward; those movements read as unspecified. A hyphen straight after the
 * implement makes it a modifier of something else ("db-facing burpees").
 */
const IMPLEMENT_RULES: readonly (MatchRule & { implement: Implement })[] = [
  { phrase: "barbell", implement: "barbell" },
  { phrase: "dumbbell", implement: "dumbbell" },
  { phrase: "db", mode: "token", implement: "dumbbell" },
  { phrase: "kettlebell", implement: "kettlebell" },
  { phrase: "kb", mode: "token", implement: "kettlebell" },
];

/** Most words allowed between the implement and the movement ("db alternating hang"). */
const MAX_GAP_WORDS = 2;

interface ImplementRange {
  range: MatchRange;
  implement: Implement;
}

/** Every implement word in `text`, left to right. Compute once per text. */
export function findImplementWords(text: string): ImplementRange[] {
  const found: ImplementRange[] = [];
  for (const rule of IMPLEMENT_RULES) {
    for (const range of findAllMatches(text, rule)) found.push({ range, implement: rule.implement });
  }
  return found.sort((a, b) => a.range[0] - b.range[0]);
}

/** The implement written directly before the movement starting at `start`, if any. */
export function implementBefore(
  words: readonly ImplementRange[],
  text: string,
  start: number,
  claimed: readonly MatchRange[]
): Implement | undefined {
  let nearest: ImplementRange | undefined;
  for (const w of words) {
    if (w.range[1] <= start) nearest = w;
    else break;
  }
  if (nearest === undefined) return undefined;

  // "dbs" and "dumbbells" end after the matched word; skip a trailing plural s.
  let gapStart = nearest.range[1];
  if (text[gapStart] === "s") gapStart += 1;
  const gap = text.slice(gapStart, start);
  if (!/^[a-z -]*$/.test(gap) || gap.startsWith("-")) return undefined;
  if (claimed.some(([cs, ce]) => cs >= gapStart && ce <= start)) return undefined;
  const wordCount = gap.split(/[ -]+/).filter((w) => w !== "").length;
  return wordCount <= MAX_GAP_WORDS ? nearest.implement : undefined;
}
