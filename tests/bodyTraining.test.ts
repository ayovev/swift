import { beforeAll, describe, expect, it } from "vitest";
import { buildInsights, type Insights } from "@/lib/analytics/buildInsights";
import { bandSentence, buildBodyTraining, hasBodyReadings, weightChangeSentence } from "@/lib/analytics/bodyTraining";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { buildTrainingMix } from "@/lib/analytics/trainingMix";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { scanRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

let all: Insights;
beforeAll(async () => {
  all = buildInsights(await loadSampleRows());
});

const scans = [
  scanRow("2025-01-10", { "Weight(lb)": "190.0", "Soft Lean Mass(lb)": "150.0", "Body Fat Mass(lb)": "30.0" }),
  scanRow("2025-03-10", { "Weight(lb)": "186.0", "Soft Lean Mass(lb)": "151.0", "Body Fat Mass(lb)": "26.0" }),
  scanRow("2025-05-10", { "Weight(lb)": "184.0", "Soft Lean Mass(lb)": "152.0", "Body Fat Mass(lb)": "23.0" }),
];
const weighIn = (date: string, weightLb: number): WeighIn => ({ date, weightLb, source: "manual" });
const entry: TimelineEntry = { id: "e", initiation: "changed", area: "nutrition", name: "Cut", startDate: "2025-02-01", endDate: "2025-04-30" };

const build = (start: string | null, end: string, over: { scans?: typeof scans; weighIns?: WeighIn[]; timeline?: TimelineEntry[] } = {}) =>
  buildBodyTraining(all.allRows, over.scans ?? scans, over.weighIns ?? [], over.timeline ?? [entry], start, end);

describe("hasBodyReadings", () => {
  it("is true with a scan or a weigh-in, and false with neither", () => {
    expect(hasBodyReadings(scans, [])).toBe(true);
    expect(hasBodyReadings([], [weighIn("2025-03-01", 180)])).toBe(true);
    expect(hasBodyReadings([], [])).toBe(false);
  });
});

describe("buildBodyTraining", () => {
  it("keeps only the readings in the period, scans and weigh-ins on days no scan covers", () => {
    const d = build("2025-01-01", "2025-04-30", { weighIns: [weighIn("2025-02-15", 188), weighIn("2025-03-10", 999)] });
    expect(d.readings.map((r) => r.date)).toEqual(["2025-01-10", "2025-02-15", "2025-03-10"]);
    // A weigh-in on a scan's day is not used (the scan is), so its weight never appears.
    expect(d.readings.map((r) => r.weightLb)).toEqual([190, 188, 186]);
    expect(d.scanReadings).toBe(2);
    expect(d.weighInReadings).toBe(1);
  });

  it("reads the first to the last reading by the noise-band rule, and says nothing with fewer than two", () => {
    const down = build("2025-01-01", "2025-06-30");
    expect(down.change).toEqual({ kind: "change", lb: -6 });
    expect(weightChangeSentence(down)).toBe("Body weight, first reading to last in this period: 190 lb to 184 lb, down 6 lb.");

    const one = build("2025-04-01", "2025-06-30");
    expect(one.readings).toHaveLength(1);
    expect(one.change).toBeNull();
    expect(weightChangeSentence(one)).toBeNull();

    const flat = build("2025-01-01", "2025-06-30", { scans: [scanRow("2025-01-10", { "Weight(lb)": "190.0" }), scanRow("2025-02-10", { "Weight(lb)": "189.0" })] });
    expect(weightChangeSentence(flat)).toMatch(/within normal variation\.$/);
    expect(bandSentence(flat.bandLb)).toMatch(/^A change of [\d.]+ lb or less between readings is within normal variation\.$/);
  });

  it("reports lean and fat only from scans", () => {
    expect(build("2025-01-01", "2025-06-30").hasLeanFat).toBe(true);
    const onlyWeighIns = build("2025-01-01", "2025-06-30", { scans: [], weighIns: [weighIn("2025-02-15", 188), weighIn("2025-03-15", 187)] });
    expect(onlyWeighIns.hasLeanFat).toBe(false);
  });

  it("takes days trained and the headline from the same builders the other reports use, as of the end of the period", () => {
    const d = build("2025-01-06", "2025-06-30");
    expect(d.mix).toEqual(buildTrainingMix(all.allRows, "2025-01-06", "2025-06-30"));
    const { subjects } = buildProgressSubjects(all.allRows.map((r) => r.raw));
    expect(d.headline).toEqual(classifySubjects(subjects, "2025-06-30").headline);
  });

  it("marks the entries that touch the period, and counts nothing after its end", () => {
    expect(build("2025-03-01", "2025-06-30").entries.map((e) => e.id)).toEqual(["e"]);
    expect(build("2025-05-15", "2025-06-30").entries).toEqual([]);
    const d = build("2025-01-01", "2025-03-31");
    expect(d.readings.at(-1)!.date).toBe("2025-03-10");
    expect(d.lastScan).toBe("2025-03-10");
  });

  it("is empty, not an error, for a period with no readings", () => {
    const d = build("2020-01-01", "2020-12-31");
    expect(d.readings).toEqual([]);
    expect(d.change).toBeNull();
    expect(d.lastScan).toBeNull();
  });

  it("never changes the headline when body readings change: body composition feeds no verdict", () => {
    const a = buildBodyTraining(all.allRows, scans, [], [], null, "2026-09-11");
    const b = buildBodyTraining(all.allRows, [], [], [], null, "2026-09-11");
    expect(a.headline).toEqual(b.headline);
  });
});
