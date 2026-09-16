import { beforeAll, describe, expect, it } from "vitest";
import { parseRows } from "@/lib/analytics/buildDashboardData";
import { buildModalityData } from "@/lib/analytics/buildModalityData";
import { MODALITY_LIST, type ModalityData } from "@/types/modality";
import type { SugarWodRow } from "@/types/sugarwod";
import { loadSampleRows } from "./fixtures/sampleRows";

/** Minimal row builder — only the fields the modality pipeline reads. */
function row(date: string, title: string, description = ""): SugarWodRow {
  return {
    date,
    title,
    description,
    best_result_raw: "",
    best_result_display: "",
    score_type: "",
    barbell_lift: "",
    set_details: "",
    notes: "",
    rx_or_scaled: "RX",
    pr: "",
  };
}

const build = (rows: SugarWodRow[]) => buildModalityData(parseRows(rows));

describe("buildModalityData — shape and invariants", () => {
  it("produces a trend series per modality, one point per month", () => {
    const data = build([
      row("01/05/2025", "ROW", "2000m row"),
      row("01/20/2025", "BACK SQUAT", "5x3 back squat"),
      row("02/03/2025", "CINDY", "pull-ups, push-ups, air squats"),
    ]);
    for (const m of MODALITY_LIST) {
      expect(data.modality_trends[m].map((p) => p.month)).toEqual(["2025-01", "2025-02"]);
    }
  });

  it("keeps each month's stacked shares summing to 100", () => {
    const data = build([
      row("01/05/2025", "TRIPLET", "400m run, 21 kb swings, 12 pull-ups"),
      row("01/12/2025", "FRAN", "21-15-9 thrusters and pull-ups"),
      row("02/02/2025", "ROW", "5000m row"),
    ]);
    for (const share of data.modality_stacked.monthly_shares) {
      const sum = Math.round((share.M + share.W + share.G) * 10) / 10;
      expect(sum, share.month).toBe(100);
    }
  });

  it("excludes unrecognised workouts from averages rather than zeroing them", () => {
    const withNoise = build([
      row("01/05/2025", "ROW", "2000m row"),
      row("01/06/2025", "DAILY LAZY MACROS POINTS", "week 1 points"),
      row("01/07/2025", "MORNING WORKOUT", "prep for the open"),
    ]);
    expect(withNoise.unclassified_count).toBe(2);
    expect(withNoise.classified_count).toBe(1);
    // The one real workout was 100% M; the noise must not dilute that.
    expect(withNoise.modality_overall.M.avg_share).toBe(100);
  });

  it("reports zero counts safely when nothing classifies at all", () => {
    const empty = build([row("01/05/2025", "DAILY LAZY MACROS POINTS", "points")]);
    expect(empty.classified_count).toBe(0);
    expect(empty.unclassified_count).toBe(1);
    for (const m of MODALITY_LIST) {
      expect(empty.modality_overall[m].avg_share).toBe(0);
      expect(empty.modality_overall[m].count).toBe(0);
    }
  });

  it("handles an entirely empty input", () => {
    const empty = build([]);
    expect(empty.classified_count).toBe(0);
    expect(empty.modality_stacked.monthly_shares).toEqual([]);
  });
});

describe("buildModalityData — drill-down lists (FR-6.4)", () => {
  it("lists only workouts with a nonzero share, newest first", () => {
    const data = build([
      row("01/05/2025", "ROW", "2000m row"),
      row("03/05/2025", "BACK SQUAT", "5x3 back squat"),
      row("02/05/2025", "FRAN", "21-15-9 thrusters and pull-ups"),
    ]);
    const w = data.modality_workout_lists.W;
    expect(w.map((e) => e.title)).toEqual(["BACK SQUAT", "FRAN"]);
    expect(data.modality_workout_lists.M.map((e) => e.title)).toEqual(["ROW"]);
  });

  it("carries the full M/W/G split and the driving movements for each entry", () => {
    const data = build([row("01/05/2025", "FRAN", "21-15-9 thrusters and pull-ups")]);
    const [entry] = data.modality_workout_lists.G;
    expect(entry).toBeDefined();
    expect(entry?.share).toBe(50);
    expect(entry?.split).toEqual({ M: 0, W: 50, G: 50 });
    expect(entry?.movements).toEqual(["Pull-ups"]);
  });
});

describe("buildModalityData — early vs late (FR-6.2)", () => {
  it("detects a shift from lifting toward conditioning", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row(`01/0${i + 1}/2025`, "BACK SQUAT", "5x3 back squat")),
      ...Array.from({ length: 6 }, (_, i) => row(`06/0${i + 1}/2025`, "ROW", "2000m row")),
    ];
    const data = build(rows);
    expect(data.modality_trend_direction.W.delta).toBeLessThan(0);
    expect(data.modality_trend_direction.M.delta).toBeGreaterThan(0);
    expect(data.modality_trend_direction.M.early_pct).toBe(0);
    expect(data.modality_trend_direction.M.late_pct).toBe(100);
  });
});

describe("buildModalityData — against the real sample export (TR-3)", () => {
  let data: ModalityData;
  let totalRows: number;

  beforeAll(async () => {
    const rows = await loadSampleRows();
    totalRows = rows.length;
    data = buildModalityData(parseRows(rows));
  });

  it("classifies the overwhelming majority of a real 4-year log", () => {
    expect(totalRows).toBe(1209);
    expect(data.classified_count + data.unclassified_count).toBe(totalRows);
    expect(data.classified_count / totalRows).toBeGreaterThan(0.95);
  });

  it("produces a plausible overall mix for a barbell-heavy CrossFit athlete", () => {
    const { M, W, G } = data.modality_overall;
    for (const stat of [M, W, G]) {
      expect(stat.avg_share).toBeGreaterThan(0);
      expect(stat.avg_share).toBeLessThan(100);
    }
    // Sanity, not a target: this athlete lifts a lot.
    expect(W.avg_share).toBeGreaterThan(M.avg_share);
    expect(W.avg_share).toBeGreaterThan(G.avg_share);
  });

  it("keeps every month's stack normalized across 47 months of real data", () => {
    expect(data.modality_stacked.monthly_shares.length).toBeGreaterThan(40);
    for (const share of data.modality_stacked.monthly_shares) {
      expect(Math.round((share.M + share.W + share.G) * 10) / 10, share.month).toBe(100);
    }
  });

  it("never reports a share outside 0–100", () => {
    for (const m of MODALITY_LIST) {
      for (const point of data.modality_trends[m]) {
        expect(point.avg_share).toBeGreaterThanOrEqual(0);
        expect(point.avg_share).toBeLessThanOrEqual(100);
        expect(point.count).toBeLessThanOrEqual(point.total);
      }
    }
  });

  it("lists every classified workout in at least one modality", () => {
    // Counted with multiplicity: the real export logs the same workout on the
    // same day more than once (e.g. "DB Pull overs" three times), so a
    // date+title key would under-count rather than reveal a gap.
    const listed = MODALITY_LIST.reduce((n, m) => n + data.modality_workout_lists[m].length, 0);
    // Every classified workout appears in at least one and at most three lists.
    expect(listed).toBeGreaterThanOrEqual(data.classified_count);
    expect(listed).toBeLessThanOrEqual(data.classified_count * 3);

    // And the stronger invariant behind it: no classified workout has an
    // all-zero split, which is what would make one vanish from every list.
    for (const m of MODALITY_LIST) {
      for (const entry of data.modality_workout_lists[m]) {
        expect(entry.share, `${entry.date} ${entry.title}`).toBeGreaterThan(0);
        const sum = Math.round((entry.split.M + entry.split.W + entry.split.G) * 10) / 10;
        expect(sum, `${entry.date} ${entry.title}`).toBe(100);
      }
    }
  });
});
