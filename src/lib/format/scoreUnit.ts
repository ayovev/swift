/**
 * A SugarWOD score with its unit, for places that show scores of different
 * kinds side by side (Overview's most recent PR, the Personal records list).
 * The export keeps the number and the kind apart: `best_result_display` is
 * "205" and `score_type` is "Load". The display text is never rewritten here,
 * only suffixed, so it stays exactly what SugarWOD logged.
 *
 * Loads are pounds: SugarWOD stores weights in pounds and converts any logged
 * in kilograms before export, so an export never carries kilograms.
 *
 * Only a plain number gets a unit. A time ("3:45", blank score type), rounds
 * plus reps ("19+16"), feet and inches ("25 6\""), free text and checkboxes are
 * already read the way the sport writes them, or have no safe unit to add.
 */
const UNIT_BY_SCORE_TYPE: Readonly<Record<string, string>> = {
  Load: "lb",
  Reps: "reps",
  Calories: "cal",
  Meters: "m",
  Inches: "in",
  Points: "pts",
};

const PLAIN_NUMBER = /^\d+(?:\.\d+)?$/;

export function withScoreUnit(display: string, scoreType: string): string {
  const unit = UNIT_BY_SCORE_TYPE[scoreType.trim()];
  const text = display.trim();
  return unit && PLAIN_NUMBER.test(text) ? `${text} ${unit}` : display;
}
