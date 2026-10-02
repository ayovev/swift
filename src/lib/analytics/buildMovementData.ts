import type { ParsedRow } from "./buildDashboardData";
import { MOVEMENT_FAMILIES } from "@/lib/classify/movementFamilies";
import { MOVEMENT_LEXICON } from "@/lib/classify/movementLexicon";
import type {
  MovementData,
  MovementOption,
  MovementSelection,
  MovementWorkout,
} from "@/types/movements";

/**
 * Reduce the shared `ParsedRow[]` to the Movements view's input. Uses the
 * movements `parseRows` already found, so nothing is re-read or re-classified.
 */
export function buildMovementData(parsedRows: readonly ParsedRow[]): MovementData {
  const workouts: MovementWorkout[] = parsedRows.map((row) => ({
    date: row.dateParsed.format("YY-MM-DD"),
    title: row.raw.title,
    bucket: row.bucket,
    movements: row.movements.map((m) => ({ id: m.id, label: m.label, phrase: m.phrase })),
  }));
  return { workouts, buckets: [...new Set(workouts.map((w) => w.bucket))].sort() };
}

const LABEL_BY_ID: ReadonlyMap<string, string> = new Map(MOVEMENT_LEXICON.map((e) => [e.id, e.label]));

/** The ids a selection stands for: a family's members, or just the movement. */
export function selectionIds(sel: MovementSelection): readonly string[] {
  if (sel.kind === "movement") return [sel.id];
  return MOVEMENT_FAMILIES.find((f) => f.id === sel.id)?.members ?? [];
}

export function selectionLabel(sel: MovementSelection): string {
  if (sel.kind === "movement") return LABEL_BY_ID.get(sel.id) ?? sel.id;
  return MOVEMENT_FAMILIES.find((f) => f.id === sel.id)?.label ?? sel.id;
}

/** Workouts that include the selection, each with the movements that matched. */
export function workoutsFor(data: MovementData, sel: MovementSelection) {
  const ids = new Set(selectionIds(sel));
  return data.workouts.flatMap((w) => {
    const matched = w.movements.filter((m) => ids.has(m.id));
    return matched.length > 0 ? [{ workout: w, matched }] : [];
  });
}

/**
 * Everything the picker offers that appears at least once in range: families
 * first (most used first), then single movements (A to Z). A movement that
 * belongs to a family is still offered on its own, so "Hang clean" can be
 * picked without the rest of the clean family.
 */
export function buildMovementOptions(data: MovementData): {
  families: MovementOption[];
  movements: MovementOption[];
} {
  const perMovement = new Map<string, number>();
  for (const w of data.workouts) for (const m of w.movements) perMovement.set(m.id, (perMovement.get(m.id) ?? 0) + 1);

  const families = MOVEMENT_FAMILIES.map((f): MovementOption => {
    const ids = new Set(f.members);
    const count = data.workouts.filter((w) => w.movements.some((m) => ids.has(m.id))).length;
    return { kind: "family", id: f.id, label: f.label, count };
  })
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const movements = [...perMovement]
    .map(([id, count]): MovementOption => ({ kind: "movement", id, label: LABEL_BY_ID.get(id) ?? id, count }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { families, movements };
}

/** Share of each bucket's workouts that include the selection, zero-filled. */
export function trendFor(data: MovementData, sel: MovementSelection): { bucket: string; value: number }[] {
  const ids = new Set(selectionIds(sel));
  const totals = new Map<string, { n: number; hit: number }>();
  for (const w of data.workouts) {
    const t = totals.get(w.bucket) ?? { n: 0, hit: 0 };
    t.n += 1;
    if (w.movements.some((m) => ids.has(m.id))) t.hit += 1;
    totals.set(w.bucket, t);
  }
  return data.buckets.map((bucket) => {
    const t = totals.get(bucket)!;
    return { bucket, value: Math.round((t.hit / t.n) * 1000) / 10 };
  });
}

/** For a family: how many of its workouts used each member. Empty for a single movement. */
export function memberBreakdown(data: MovementData, sel: MovementSelection): { id: string; label: string; count: number }[] {
  if (sel.kind !== "family") return [];
  return selectionIds(sel)
    .map((id) => ({
      id,
      label: LABEL_BY_ID.get(id) ?? id,
      count: data.workouts.filter((w) => w.movements.some((m) => m.id === id)).length,
    }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
