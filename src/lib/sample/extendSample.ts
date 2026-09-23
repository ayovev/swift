import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { SugarWodRow } from "@/types/sugarwod";

dayjs.extend(customParseFormat);

/**
 * The bundled sample export (public/sample/sugarwod-sample-export.csv) is a
 * frozen, real CSV — CLAUDE.md's hard constraint #4 pins a golden parity
 * fixture to it byte-for-byte, so that file must never change. But a frozen
 * export goes stale: every day past its last logged date, demo mode shows a
 * training log that visibly stops in the past.
 *
 * This module bridges that gap entirely in memory, at demo-load time: given
 * the parsed rows from the frozen file, it generates plausible additional
 * rows from the day after the file ends through today and returns the
 * combined array. Nothing is written back to the bundled file or to disk —
 * see App.tsx's handleSample, the only caller — so the parity fixture stays
 * exactly as valid as it is today, and (per hard constraint #1) this is
 * still pure client-side generation, no network request involved.
 *
 * Content is templated, not freeform-random: the classifier needs real GPP
 * and M/W/G vocabulary to produce a demo that doesn't look broken (empty
 * domains, a nonsensical modality split). Cadence (how many days a week,
 * how many sessions per attended day, RX vs scaled) and lift starting
 * weights are DERIVED from the real historical rows rather than guessed, so
 * the generated tail reads as a continuation of the same athlete rather
 * than an obviously different one bolted on — and so this keeps working if
 * the bundled export is ever swapped for a different one.
 *
 * Generation is deterministic per calendar day (seeded off the date string,
 * not off "now"), so reloading demo mode partway through a day never
 * reshuffles days already generated — only the newest day can change, and
 * only because it's freshly generated each time.
 */

// ---------------------------------------------------------------- RNG ----

/** FNV-1a string hash — good enough spread for a display-only PRNG seed. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, decent-quality PRNG; no crypto properties needed here. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh PRNG for one (date, purpose) pair, so independent draws don't correlate. */
function rngFor(dateKey: string, purpose: string): () => number {
  return mulberry32(hashSeed(`${dateKey}:${purpose}`));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ----------------------------------------------------------- templates ----

type ResultKind = "time" | "roundsReps" | "reps";

interface WorkoutTemplate {
  title: string;
  description: string;
  scoreType: string;
  kind: ResultKind;
  /** Seconds for "time", completed rounds for "roundsReps", total reps for "reps". */
  range: readonly [number, number];
}

/**
 * General metcons, not the named girls/heroes below — titled and worded like
 * the real export (movements glued together with no separator, per
 * matcher.ts's header comment), spanning all ten GPP domains and all three
 * modalities so a generated demo month classifies the same way a real one
 * does.
 */
const METCON_TEMPLATES: readonly WorkoutTemplate[] = [
  {
    title: "SQUAT & RUN",
    description: "5 rounds for time:400-m run15 back squats (95/135 lb)",
    scoreType: "",
    kind: "time",
    range: [600, 1200],
  },
  {
    title: "PULL & PRESS",
    description: "AMRAP 15:8 chest-to-bar pull-ups10 push presses (75/115 lb)12 box jumps (20/24 in)",
    scoreType: "Rounds + Reps",
    kind: "roundsReps",
    range: [4, 9],
  },
  {
    title: "ROW & CARRY",
    description: "4 rounds for time:500-m row20 kettlebell swings (35/53 lb)40-ft farmer carry (2x53/70 lb)",
    scoreType: "",
    kind: "time",
    range: [480, 900],
  },
  {
    title: "DOUBLE TROUBLE",
    description: "3 rounds for time:50 double-unders15 wall-ball shots (14/20 lb)10 burpees",
    scoreType: "",
    kind: "time",
    range: [420, 780],
  },
  {
    title: "SNATCH & SPRINT",
    description: "EMOM 12:Odd: 3 power snatches (65/95 lb)Even: 200-m sprint",
    scoreType: "Reps",
    kind: "reps",
    range: [8, 12],
  },
  {
    title: "MUSCLE UP CHIPPER",
    description: "For time:30 toes-to-bar20 muscle-ups10 handstand push-ups",
    scoreType: "",
    kind: "time",
    range: [420, 900],
  },
  {
    title: "DEADLIFT DESCENT",
    description: "21-15-9Deadlifts (135/205 lb)Box jump-overs (20/24 in)",
    scoreType: "",
    kind: "time",
    range: [300, 600],
  },
  {
    title: "CLEAN COMPLEX",
    description: "AMRAP 10:5 hang power cleans (95/135 lb)10 air squats15 double-unders",
    scoreType: "Rounds + Reps",
    kind: "roundsReps",
    range: [5, 10],
  },
  {
    title: "BIKE & BURPEE",
    description: "4 rounds for time:1000-m bike15 burpees10 kettlebell swings (35/53 lb)",
    scoreType: "",
    kind: "time",
    range: [600, 960],
  },
  {
    title: "THRUSTER TEST",
    description: "21-15-9Thrusters (65/95 lb)Ring rows",
    scoreType: "",
    kind: "time",
    range: [300, 540],
  },
  {
    title: "SKI & SWING",
    description: "3 rounds for time:500-m ski erg25 Russian KB swings (35/53 lb)15 pull-ups",
    scoreType: "",
    kind: "time",
    range: [540, 900],
  },
  {
    title: "OVERHEAD ODYSSEY",
    description: "5 rounds for time:10 overhead squats (65/95 lb)200-m run10 toes-to-bar",
    scoreType: "",
    kind: "time",
    range: [600, 960],
  },
  {
    title: "FARMER FINALE",
    description: "For time:800-m farmer carry (2x53/70 lb)50 wall-ball shots (14/20 lb)30 pull-ups",
    scoreType: "",
    kind: "time",
    range: [480, 900],
  },
  {
    title: "SANDBAG SHUFFLE",
    description: "AMRAP 14:10 sandbag cleans10 box jumps (20/24 in)200-m run",
    scoreType: "Rounds + Reps",
    kind: "roundsReps",
    range: [5, 9],
  },
];

/**
 * The girls and a couple of heroes — exact-uppercase titles so they land in
 * DashboardData.benchmarks the same way real logs of them do (see
 * NAMED_BENCHMARKS in buildDashboardData.ts).
 */
const NAMED_BENCHMARK_TEMPLATES: readonly WorkoutTemplate[] = [
  {
    title: "FRAN",
    description: "21-15-9Thrusters (65/95 lb)Pull-ups",
    scoreType: "",
    kind: "time",
    range: [180, 420],
  },
  {
    title: "GRACE",
    description: "30 clean and jerks for time Rx (95/135 lb)",
    scoreType: "",
    kind: "time",
    range: [120, 300],
  },
  {
    title: "MURPH",
    description:
      "For time:1-mile run100 pull-ups200 push-ups300 air squats1-mile run- Partition the pull-ups, push-ups, and squats as needed.",
    scoreType: "",
    kind: "time",
    range: [1800, 3600],
  },
  {
    title: "HELEN",
    description: "3 rounds for time:400-m run21 kettlebell swings (35/53 lb)12 pull-ups",
    scoreType: "",
    kind: "time",
    range: [480, 720],
  },
  {
    title: "DIANE",
    description: "21-15-9Deadlifts (155/225 lb)Handstand push-ups",
    scoreType: "",
    kind: "time",
    range: [240, 600],
  },
  {
    title: "NANCY",
    description: "5 rounds for time:400-m run15 overhead squats (65/95 lb)",
    scoreType: "",
    kind: "time",
    range: [900, 1500],
  },
  {
    title: "CINDY",
    description: "AMRAP 20:5 pull-ups10 push-ups15 air squats",
    scoreType: "Rounds + Reps",
    kind: "roundsReps",
    range: [12, 22],
  },
  {
    title: "ANNIE",
    description: "50-40-30-20-10Double-undersSit-ups",
    scoreType: "",
    kind: "time",
    range: [300, 600],
  },
  {
    title: "JACKIE",
    description: "For time:1000-m row50 thrusters (45 lb)30 pull-ups",
    scoreType: "",
    kind: "time",
    range: [360, 600],
  },
  {
    title: "KAREN",
    description: "150 wall-ball shots (14/20 lb) for time",
    scoreType: "",
    kind: "time",
    range: [420, 900],
  },
];

interface LiftScheme {
  /** Appended to the lift name as the title, e.g. "Back Squat 5x5". */
  label: string;
  /** Reps per set — what repMax.ts's SxR/explicit-RM parsing reads back out. */
  reps: number;
}

const LIFT_SCHEMES: readonly LiftScheme[] = [
  { label: "5x5", reps: 5 },
  { label: "3x3", reps: 3 },
  { label: "3x5", reps: 5 },
  { label: "7x1", reps: 1 },
  { label: "5x2", reps: 2 },
];

interface LiftDefinition {
  name: string;
  /** Used only when the historical rows have no prior entry for this lift. */
  baselineWeight: number;
}

const LIFT_DEFINITIONS: readonly LiftDefinition[] = [
  { name: "Back Squat", baselineWeight: 225 },
  { name: "Front Squat", baselineWeight: 185 },
  { name: "Deadlift", baselineWeight: 315 },
  { name: "Clean & Jerk", baselineWeight: 165 },
  { name: "Snatch", baselineWeight: 125 },
  { name: "Push Press", baselineWeight: 135 },
  { name: "Bench Press", baselineWeight: 165 },
];

// ------------------------------------------------------------ helpers ----

function parseRowDate(row: SugarWodRow): Dayjs {
  return dayjs((row.date ?? "").trim(), "MM/DD/YYYY", true);
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function resultFor(
  template: WorkoutTemplate,
  rng: () => number
): { raw: string; display: string } {
  const [min, max] = template.range;
  if (template.kind === "time") {
    const seconds = randInt(rng, min, max);
    return { raw: String(seconds), display: formatTime(seconds) };
  }
  if (template.kind === "roundsReps") {
    const rounds = randInt(rng, min, max);
    const reps = randInt(rng, 0, 19);
    return { raw: `${rounds}.${String(reps).padStart(4, "0")}`, display: `${rounds}+${reps}` };
  }
  const reps = randInt(rng, min, max);
  return { raw: String(reps), display: String(reps) };
}

interface HistoricalStats {
  attendanceProb: number;
  secondSessionProb: number;
  rxProb: number;
  liftMaxByName: Map<string, number>;
}

function historicalStats(rows: readonly SugarWodRow[]): HistoricalStats {
  const dates = rows.map(parseRowDate).filter((d) => d.isValid());
  const dayKeys = new Set(dates.map((d) => d.format("YYYY-MM-DD")));

  let attendanceProb = 0.5;
  if (dates.length > 0) {
    const first = dates.reduce((a, b) => (a.isBefore(b) ? a : b));
    const last = dates.reduce((a, b) => (a.isAfter(b) ? a : b));
    const spanDays = Math.max(1, last.diff(first, "day") + 1);
    attendanceProb = clamp(dayKeys.size / spanDays, 0.15, 0.9);
  }

  const secondSessionProb =
    dayKeys.size > 0 ? clamp(rows.length / dayKeys.size - 1, 0, 0.6) : 0.2;

  const rxCount = rows.filter((r) => r.rx_or_scaled === "RX").length;
  const scaledCount = rows.filter((r) => r.rx_or_scaled === "SCALED").length;
  const rxProb = rxCount + scaledCount > 0 ? rxCount / (rxCount + scaledCount) : 0.75;

  const liftMaxByName = new Map<string, number>();
  for (const def of LIFT_DEFINITIONS) liftMaxByName.set(def.name, def.baselineWeight);
  for (const row of rows) {
    if (row.score_type !== "Load" || !row.barbell_lift) continue;
    const value = Number.parseFloat(row.best_result_raw);
    if (Number.isNaN(value)) continue;
    const current = liftMaxByName.get(row.barbell_lift) ?? 0;
    if (value > current) liftMaxByName.set(row.barbell_lift, value);
  }

  return { attendanceProb, secondSessionProb, rxProb, liftMaxByName };
}

function roundToFive(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/** Picks one session's content for a given date/session index. */
function generateSession(
  dateKey: string,
  sessionIndex: number,
  dateForRow: string,
  stats: HistoricalStats
): SugarWodRow {
  const typeRng = rngFor(dateKey, `type-${sessionIndex}`);
  const rxRng = rngFor(dateKey, `rx-${sessionIndex}`);
  const rx = rxRng() < stats.rxProb ? "RX" : "SCALED";

  const roll = typeRng();
  if (roll < 0.55) {
    const template = pick(rngFor(dateKey, `metcon-${sessionIndex}`), METCON_TEMPLATES);
    const { raw, display } = resultFor(template, rngFor(dateKey, `result-${sessionIndex}`));
    const pr = rngFor(dateKey, `pr-${sessionIndex}`)() < 0.03 ? "PR" : "";
    return {
      date: dateForRow,
      title: template.title,
      description: template.description,
      best_result_raw: raw,
      best_result_display: display,
      score_type: template.scoreType,
      barbell_lift: "",
      set_details: "",
      notes: "",
      rx_or_scaled: rx,
      pr,
    };
  }

  if (roll < 0.85) {
    const def = pick(rngFor(dateKey, `lift-${sessionIndex}`), LIFT_DEFINITIONS);
    const scheme = pick(rngFor(dateKey, `scheme-${sessionIndex}`), LIFT_SCHEMES);
    const currentMax = stats.liftMaxByName.get(def.name) ?? def.baselineWeight;
    const driftRng = rngFor(dateKey, `weight-${sessionIndex}`);
    const weight = roundToFive(currentMax * (1 + (driftRng() - 0.35) * 0.05));
    const isPr = weight > currentMax;
    if (isPr) stats.liftMaxByName.set(def.name, weight);
    return {
      date: dateForRow,
      title: `${def.name} ${scheme.label}`,
      description: `${def.name} for load: work up to a heavy set of ${scheme.reps}.`,
      best_result_raw: String(weight),
      best_result_display: String(weight),
      score_type: "Load",
      barbell_lift: def.name,
      set_details: "",
      notes: "",
      rx_or_scaled: rx,
      pr: isPr ? "PR" : "",
    };
  }

  const template = pick(rngFor(dateKey, `benchmark-${sessionIndex}`), NAMED_BENCHMARK_TEMPLATES);
  const { raw, display } = resultFor(template, rngFor(dateKey, `result-${sessionIndex}`));
  const pr = rngFor(dateKey, `pr-${sessionIndex}`)() < 0.05 ? "PR" : "";
  return {
    date: dateForRow,
    title: template.title,
    description: template.description,
    best_result_raw: raw,
    best_result_display: display,
    score_type: template.scoreType,
    barbell_lift: "",
    set_details: "",
    notes: "",
    rx_or_scaled: rx,
    pr,
  };
}

// -------------------------------------------------------------- API ----

/**
 * Extends the given (already-parsed) sample rows with generated rows from
 * the day after their latest date through `today`, and returns the combined
 * array — the input array itself is left untouched. Returns `rows` as-is
 * (same reference) when there's nothing to add: no valid dates in `rows`, or
 * the rows already reach up to `today`.
 */
export function extendSampleRows(
  rows: readonly SugarWodRow[],
  today: Dayjs = dayjs()
): SugarWodRow[] {
  const dates = rows.map(parseRowDate).filter((d) => d.isValid());
  if (dates.length === 0) return [...rows];

  const lastDate = dates.reduce((a, b) => (a.isAfter(b) ? a : b));
  if (!today.startOf("day").isAfter(lastDate.startOf("day"))) return [...rows];

  const stats = historicalStats(rows);
  const generated: SugarWodRow[] = [];

  let cursor = lastDate.add(1, "day");
  while (!cursor.startOf("day").isAfter(today.startOf("day"))) {
    const dateKey = cursor.format("YYYY-MM-DD");
    const dateForRow = cursor.format("MM/DD/YYYY");

    if (rngFor(dateKey, "attendance")() < stats.attendanceProb) {
      const sessionCount = rngFor(dateKey, "sessions")() < stats.secondSessionProb ? 2 : 1;
      for (let i = 0; i < sessionCount; i++) {
        generated.push(generateSession(dateKey, i, dateForRow, stats));
      }
    }

    cursor = cursor.add(1, "day");
  }

  return [...rows, ...generated];
}
