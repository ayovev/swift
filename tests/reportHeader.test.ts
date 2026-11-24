import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every report's header is the one in `ReportSheet.tsx` (docs/reports.md, R-9): a report supplies a title, a period and a body, and never
 * draws its own header. A new report that skips the sheet, or draws a `<header>` of its own, fails here.
 */
const DIR = `${process.cwd()}/src/components/reports`;
const REPORT_VIEWS = readdirSync(DIR).filter((f) => /Tab\.tsx$/.test(f));

describe("the shared report header", () => {
  it("finds the four report views", () => {
    expect(REPORT_VIEWS.sort()).toEqual(["BodyTrainingTab.tsx", "ReportsTab.tsx", "SkillsTab.tsx", "TrainingMixTab.tsx"]);
  });

  for (const file of REPORT_VIEWS) {
    it(`${file} prints through ReportSheet and draws no header of its own`, () => {
      const src = readFileSync(`${DIR}/${file}`, "utf8");
      expect(src).toMatch(/<ReportSheet\b[^>]*\bperiod=/);
      expect(src).not.toMatch(/<header\b/);
    });
  }
});
