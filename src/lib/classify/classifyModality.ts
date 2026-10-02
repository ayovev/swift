import { classifiableText, findAllMatches, type MatchRange } from "./matcher";
import { MOVEMENT_FAMILIES } from "./movementFamilies";
import { LEXICON_BY_SPECIFICITY, type MovementEntry } from "./movementLexicon";
import { MODALITY_LIST } from "@/types/modality";
import type {
  Modality,
  ModalityClassification,
  ModalitySplit,
  MovementHit,
} from "@/types/modality";

const EMPTY_SPLIT: ModalitySplit = { M: 0, W: 0, G: 0 };

/** Does [start,end) overlap any already-claimed range? */
function overlaps(start: number, end: number, claimed: readonly MatchRange[]): boolean {
  return claimed.some(([cs, ce]) => start < ce && end > cs);
}

/**
 * Find the distinct movements named in a workout's text.
 *
 * Longest phrase first, claiming character ranges as it goes, so a specific
 * movement always beats the generic one inside it:
 *
 *   "power clean"  claims the span, so bare "clean" cannot also count it
 *   "ring row" (G) and "db row" (W) claim before bare "row" (M)
 *   "air squat" (G) claims before bare "squat" (W)
 *
 * This resolves collisions structurally, so adding a movement to the lexicon
 * never requires hand-tuning the order of anything else.
 *
 * A movement is counted ONCE however many times it is named — a workout that
 * says "clean" three times is not three times as much weightlifting.
 *
 * @param text lowercased title + description + barbell_lift.
 */
export function findMovements(text: string): MovementHit[] {
  const claimed: MatchRange[] = [];
  /** id -> hit, so two phrases for the same movement don't double-count. */
  const byId = new Map<string, { hit: MovementHit; at: number }>();

  for (const entry of LEXICON_BY_SPECIFICITY) {
    for (const [start, end] of findAllMatches(text, entry)) {
      if (overlaps(start, end, claimed)) continue;
      claimed.push([start, end]);

      const existing = byId.get(entry.id);
      if (existing === undefined || start < existing.at) {
        byId.set(entry.id, {
          at: start,
          hit: { id: entry.id, phrase: entry.phrase, label: entry.label, modality: entry.modality, source: "text" },
        });
      }
    }
  }

  // Report in the order the movements appear in the workout text — that reads
  // as the workout was written, rather than as the lexicon happens to be sorted.
  return [...byId.values()].sort((a, b) => a.at - b.at).map((v) => v.hit);
}

/**
 * The movements for one logged workout, with SugarWOD's own typed
 * `barbell_lift` field taking priority over the free text.
 *
 * `barbell_lift` is the one place the export names a movement as data rather
 * than prose, so when it names a lift we read it first (through the same
 * lexicon, so every alias and spelling resolves to the same id) and those hits
 * are authoritative. The text is still searched, because a complex or a WOD
 * names other movements the field does not, but it may not contradict the
 * field: a generic bare word from the text ("squat" from "(full squat)", or in
 * a front squat session's description) is dropped when the typed lift is a
 * more specific member of that word's family. Anything else the text found is
 * kept after the typed hits.
 *
 * A row with no `barbell_lift`, or one the lexicon does not recognise, falls
 * back to the text alone, exactly as before.
 */
export function findRowMovements(fields: {
  title?: string | null;
  description?: string | null;
  barbell_lift?: string | null;
}): MovementHit[] {
  const fromText = findMovements(classifiableText(fields));
  const typed = findMovements((fields.barbell_lift ?? "").toLowerCase()).map(
    (hit): MovementHit => ({ ...hit, source: "barbell_lift" })
  );
  if (typed.length === 0) return fromText;

  const typedIds = new Set(typed.map((h) => h.id));
  const dropGeneric = new Set<string>();
  for (const family of MOVEMENT_FAMILIES) {
    if (family.generic === undefined) continue;
    if (typed.some((h) => h.id !== family.generic && family.members.includes(h.id))) {
      dropGeneric.add(family.generic);
    }
  }
  return [...typed, ...fromText.filter((h) => !typedIds.has(h.id) && !dropGeneric.has(h.id))];
}

/**
 * Round three shares to one decimal so they sum to exactly 100.0.
 *
 * Rounding each share independently drifts off 100 (three thirds each round
 * to 33.3, summing to 99.9), which looks broken in a stacked chart. This uses
 * the largest-remainder method: floor every share to a tenth, then hand the
 * leftover tenths to whichever shares were cut by the most. Unbiased, unlike
 * always topping up the largest share.
 *
 * Values are returned in tenths-exact form, so `a + b + c` in floating point
 * can still land on 99.99999999999999 — compare a rounded sum, not a raw one.
 */
export function sharesTo100(weights: Record<Modality, number>, total: number): ModalitySplit {
  if (total === 0) return { ...EMPTY_SPLIT };

  // Work in tenths of a percent as integers to avoid float drift.
  const TENTHS = 1000;
  const exact = {} as Record<Modality, number>;
  const floored = {} as Record<Modality, number>;
  for (const m of MODALITY_LIST) {
    exact[m] = (weights[m] / total) * TENTHS;
    floored[m] = Math.floor(exact[m]);
  }

  let leftover = TENTHS - MODALITY_LIST.reduce((n, m) => n + floored[m], 0);
  const byRemainder = [...MODALITY_LIST].sort(
    (a, b) => exact[b] - floored[b] - (exact[a] - floored[a])
  );
  for (const m of byRemainder) {
    if (leftover <= 0) break;
    floored[m] += 1;
    leftover -= 1;
  }

  return {
    M: floored.M / 10,
    W: floored.W / 10,
    G: floored.G / 10,
  };
}

/**
 * Classify one workout's proportional composition across M/W/G.
 *
 * Each distinct movement contributes equal weight to its modality. A workout
 * naming a run, a kettlebell swing and a pull-up is 33.3 M / 33.3 W / 33.4 G.
 *
 * @param text lowercased title + description + barbell_lift.
 */
export function classifyModality(text: string): ModalityClassification {
  return classifyMovements(findMovements(text));
}

/**
 * The same classification from movements already found, so the pipeline can
 * run `findMovements` once per row (in `parseRows`) and share the result.
 */
export function classifyMovements(movements: MovementHit[]): ModalityClassification {
  if (movements.length === 0) {
    // Nothing recognised. Reported as unclassified and excluded from every
    // average, rather than counted as a workout that was 0% of everything.
    return { split: { ...EMPTY_SPLIT }, movements: [], classified: false };
  }

  const weights: Record<Modality, number> = { M: 0, W: 0, G: 0 };
  for (const hit of movements) weights[hit.modality] += 1;

  return {
    split: sharesTo100(weights, movements.length),
    movements,
    classified: true,
  };
}

/** Movement labels that drove one modality's share, for the drill-down list. */
export function movementsFor(movements: readonly MovementHit[], modality: Modality): string[] {
  return movements.filter((m) => m.modality === modality).map((m) => m.label);
}

export type { MovementEntry };
