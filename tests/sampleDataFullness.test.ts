import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { describe, expect, it } from "vitest";
import { loadSampleRows } from "./fixtures/sampleRows";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { entryVerdict } from "@/lib/analytics/insights/entryVerdict";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { validateEntryList } from "@/lib/analytics/timeline";
import { extendSampleRows } from "@/lib/sample/extendSample";
import { generateSampleBodyComp } from "@/lib/sample/generateSampleBodyComp";
import { generateSampleTimeline } from "@/lib/sample/generateSampleTimeline";

dayjs.extend(customParseFormat);

/**
 * Not just that each generator produces schema-valid output (see their own test files), but that feeding the real bundled sample export
 * through the full demo-mode pipeline — extendSampleRows, then the sample generators — gives the Progress and Timeline views something
 * real to show, not their empty states across the board.
 */
describe("sample demo data is full enough to drive the insights tabs", () => {
  const today = dayjs("2026-10-02");

  it("gives Progress a headline and gives the Timeline entries that pass the list check", async () => {
    const workoutRows = extendSampleRows(await loadSampleRows(), today);
    expect(generateSampleBodyComp(workoutRows, today).length).toBeGreaterThan(0);

    const { subjects } = buildProgressSubjects(workoutRows);
    const { headline } = classifySubjects(subjects, today.format("YYYY-MM-DD"));
    expect(headline.label).not.toBeNull();

    const timeline = generateSampleTimeline(workoutRows, today);
    expect(timeline.length).toBeGreaterThan(0);
    expect(validateEntryList(timeline).status).toBe("ok");
    expect(timeline.some((e) => e.initiation === "changed")).toBe(true);
    expect(timeline.some((e) => e.initiation === "happened")).toBe(true);
    expect(timeline.some((e) => e.endDate === null)).toBe(true);
  });

  it("gives at least one entry the athlete changed a before and after, and the rest a plain shortfall", async () => {
    const workoutRows = extendSampleRows(await loadSampleRows(), today);
    const { subjects } = buildProgressSubjects(workoutRows);
    const asOf = today.format("YYYY-MM-DD");
    const verdicts = generateSampleTimeline(workoutRows, today)
      .filter((e) => e.initiation === "changed")
      .map((e) => entryVerdict(e, subjects, asOf));
    expect(verdicts.some((v) => v.label !== null)).toBe(true);
    for (const v of verdicts.filter((x) => x.label === null)) expect(v.counted).toBeLessThan(3);
  });
});
