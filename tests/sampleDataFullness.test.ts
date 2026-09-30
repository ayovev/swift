import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { describe, expect, it } from "vitest";
import { loadSampleRows } from "./fixtures/sampleRows";
import { getAlignment } from "@/lib/analytics/alignment";
import { getExperimentInsight } from "@/lib/analytics/experimentInsight";
import { getPlateauInsights } from "@/lib/analytics/plateauDetector";
import { extendSampleRows } from "@/lib/sample/extendSample";
import { generateSampleBodyComp } from "@/lib/sample/generateSampleBodyComp";
import { generateSampleExperiments } from "@/lib/sample/generateSampleExperiments";
import { generateSampleTags } from "@/lib/sample/generateSampleTags";
import { getCycleReport, getCycles } from "@/lib/analytics/cycleReport";

dayjs.extend(customParseFormat);

/**
 * This is the test that actually pins the point of this feature: not just
 * that each generator produces schema-valid output (see their own test
 * files), but that feeding the real bundled sample export through the full
 * demo-mode pipeline — extendSampleRows, then the two new generators —
 * gives the Plateau Detector, Alignment, and Experiments tabs something
 * real to show, not their empty/insufficient_data states across the board.
 */
describe("sample demo data is full enough to drive the insights tabs", () => {
  it("produces at least some classified plateau insights, an alignment read, and a classified experiment", async () => {
    const realRows = await loadSampleRows();
    const today = dayjs("2026-10-02");

    const workoutRows = extendSampleRows(realRows, today);
    const bodyCompRows = generateSampleBodyComp(workoutRows, today);
    const experiments = generateSampleExperiments(workoutRows, today);

    expect(bodyCompRows.length).toBeGreaterThan(0);
    expect(experiments.length).toBeGreaterThan(0);

    const plateauInsights = getPlateauInsights(workoutRows, bodyCompRows, today.toDate());
    const classifiedPlateaus = plateauInsights.filter((i) => i.classification !== "insufficient_data");
    expect(classifiedPlateaus.length).toBeGreaterThan(0);

    const alignment = getAlignment(plateauInsights, bodyCompRows, today.toDate());
    expect(alignment.classification).not.toBe("insufficient_data");

    const experimentInsights = experiments.map((experiment) =>
      getExperimentInsight(experiment, workoutRows, bodyCompRows, today.toDate())
    );
    expect(experimentInsights.some((i) => i.classification !== "insufficient_data")).toBe(true);
  });

  it("gives the Tags and Cycles views real tags and blocks, and the insights that read tags stay valid", async () => {
    const workoutRows = extendSampleRows(await loadSampleRows(), dayjs("2026-10-02"));
    const today = dayjs("2026-10-02");
    const bodyCompRows = generateSampleBodyComp(workoutRows, today);
    const tags = generateSampleTags(workoutRows, today);
    expect(tags.length).toBeGreaterThan(0);

    const cycles = getCycles(workoutRows, tags, { asOfDate: today.toDate() });
    expect(cycles.length).toBeGreaterThan(0);
    const reports = cycles.map((c) => getCycleReport(c, workoutRows, bodyCompRows, { tags }));
    expect(reports.some((r) => r.status === "ok")).toBe(true);

    // Tags only ever add notes; they must not change a classification.
    const plain = getPlateauInsights(workoutRows, bodyCompRows, today.toDate());
    const tagged = getPlateauInsights(workoutRows, bodyCompRows, today.toDate(), { tags });
    expect(tagged.map((i) => i.classification)).toEqual(plain.map((i) => i.classification));
  });
});
