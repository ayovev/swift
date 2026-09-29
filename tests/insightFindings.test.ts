import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInsightFindings, formatInsightFindings } from "@/lib/analytics/insightFindings";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import { parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { extendSampleRows } from "@/lib/sample/extendSample";
import { generateSampleBodyComp } from "@/lib/sample/generateSampleBodyComp";
import { generateSampleExperiments } from "@/lib/sample/generateSampleExperiments";
import type { Experiment } from "@/types/experiment";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * Maintainer tool, not a regression test in its own right. To see the noise
 * bands and the before/after diff for your own exports, run from the repo root:
 *
 *   SWIFT_SUGARWOD_CSV=/path/sugarwod.csv SWIFT_INBODY_CSV=/path/inbody.csv \
 *   [SWIFT_EXPERIMENTS_JSON=/path/experiments.json] [SWIFT_FINDINGS_OUT=report.txt] \
 *   npx vitest run tests/insightFindings.test.ts
 *
 * The report lands in insight-findings.txt (gitignored). Nothing leaves the machine; the files are read with the app's own parsers.
 * Without the env vars it runs on the bundled sample plus the synthetic
 * InBody generator, which only proves the report builds.
 */
const SUGARWOD = process.env.SWIFT_SUGARWOD_CSV;
const INBODY = process.env.SWIFT_INBODY_CSV;
const EXPERIMENTS = process.env.SWIFT_EXPERIMENTS_JSON;

describe("insight findings report", () => {
  it("prints bands and the before/after diff", async () => {
    let workouts;
    let scans;
    let experiments: Experiment[];
    if (SUGARWOD && INBODY) {
      workouts = await parseSugarWodCsv(readFileSync(SUGARWOD, "utf8"));
      scans = await parseInBodyCsv(readFileSync(INBODY, "utf8"));
      experiments = EXPERIMENTS ? (JSON.parse(readFileSync(EXPERIMENTS, "utf8")) as Experiment[]) : [];
    } else {
      workouts = extendSampleRows(await loadSampleRows());
      scans = generateSampleBodyComp(workouts);
      experiments = generateSampleExperiments(workouts);
    }
    const findings = buildInsightFindings(workouts, scans, experiments, new Date());
    const report = `${SUGARWOD ? "REAL EXPORTS" : "SYNTHETIC SAMPLE"}\n${formatInsightFindings(findings)}\n`;
    // Written to a file because the suite's setup silences console output.
    writeFileSync(process.env.SWIFT_FINDINGS_OUT ?? "insight-findings.txt", report);
    expect(findings.compared).toBeGreaterThan(0);
  });
});
