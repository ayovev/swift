/**
 * SugarWOD exports concatenate description lines with no separator at all —
 * the same raw text the classifier reads (see matcher.ts's header comment;
 * real examples include "21-15-9DeadliftsPull-ups" and "25 burpeeswall-ball
 * shots"). This module turns that glued text into readable paragraphs for
 * DISPLAY ONLY. Nothing here touches ParsedRow.raw or classifiableText(), so
 * it cannot move the parity fixture — WorkoutsTab is the only caller.
 *
 * Two independent fixes, both measured against the real 1,209-row sample
 * export rather than guessed:
 *
 * 1. Word-boundary spacing. Glue always happens at one of four boundaries:
 *    lowercase/digit -> uppercase ("burpeesRx"), a 2+ letter word -> digit
 *    ("overs800"), a digit -> 3+ lowercase letters ("70lbs"), or a closing
 *    paren -> letter/digit ("lb)Double"). The word->digit and digit->word
 *    rules deliberately require 2+/3+ chars on the word side so they don't
 *    touch "5x3"-style rep notation (a single "x" between two digits) or
 *    "1RM"/"4RM" (digit -> exactly two uppercase letters, left to rule 1
 *    only, which reads fine as "1 RM").
 *
 * 2. Paragraph breaks on delimiter hyphens. SugarWOD's own scaling-level
 *    blocks and inline notes are joined with a bare "-": "- RX -...-
 *    INTERMEDIATE -...- BEGINNER -...", "5 deadlifts - Maintain same load
 *    across all sets." A hyphen is a REAL hyphen — part of a compound word
 *    ("push-ups") or a unit ("20-lb", "400-m") or a rep scheme
 *    ("5-5-5-5-5") — when its two neighbors are lowercase/lowercase,
 *    digit/lowercase, or digit/digit. Every other hyphen is a delimiter: it
 *    starts a new paragraph and is dropped rather than kept as stray
 *    punctuation.
 *
 * Known, accepted gap: a hyphen meant as a delimiter but flanked by two
 * lowercase letters on both sides (e.g. "run -then-800m", two occurrences in
 * the whole sample export) reads as one compound word instead of splitting.
 * Rare enough, and the fallback (a literal "-" inline) is still readable, so
 * this isn't special-cased further.
 */

const LOWER_OR_DIGIT_TO_UPPER = /([a-z0-9])([A-Z])/g;
const WORD_TO_DIGIT = /([a-zA-Z]{2,})(\d)/g;
const DIGIT_TO_WORD = /(\d)([a-z]{3,})/g;
const PAREN_TO_ALNUM = /(\))([A-Za-z0-9])/g;

function spaceGluedWords(text: string): string {
  return text
    .replace(LOWER_OR_DIGIT_TO_UPPER, "$1 $2")
    .replace(WORD_TO_DIGIT, "$1 $2")
    .replace(DIGIT_TO_WORD, "$1 $2")
    .replace(PAREN_TO_ALNUM, "$1 $2");
}

function isLower(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "a" && ch <= "z";
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/** Split on every "-" that isn't a compound-word, unit, or rep-scheme hyphen. */
function splitOnDelimiterHyphens(text: string): string[] {
  const segments: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "-") {
      const prev = text[i - 1];
      const next = text[i + 1];
      const isCompoundOrUnit = (isLower(prev) || isDigit(prev)) && isLower(next);
      const isRepScheme = isDigit(prev) && isDigit(next);
      if (isCompoundOrUnit || isRepScheme) {
        current += ch;
        continue;
      }
      segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments;
}

/** A short all-caps paragraph like "RX" or "INTERMEDIATE" — SugarWOD's own
 *  scaling-level labels, worth rendering as a heading rather than prose. */
export function isLevelLabel(line: string): boolean {
  return /^[A-Z][A-Z' ]{0,24}$/.test(line);
}

/**
 * Format a raw SugarWOD description into readable paragraphs for display.
 * Empty/whitespace-only paragraphs (e.g. from two adjacent delimiters) are
 * dropped.
 */
export function formatWorkoutDescription(raw: string): string[] {
  return splitOnDelimiterHyphens(spaceGluedWords(raw))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}
