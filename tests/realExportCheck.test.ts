import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import { parseInBodyDate, parseNumericField } from "@/lib/analytics/scanParsing";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import type { EntrySpec, Scan } from "../scripts/realExportCheck/analysis.ts";
import { buildReport } from "../scripts/realExportCheck/report.ts";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * The real-export check: the progress verdict (src/lib/analytics/insights, pinned in tests/progressVerdict.test.ts) run over an
 * export and reported as counts. The report is built from the real engine, not a copy of it.
 *
 * Running it on a real export (never committed, never uploaded):
 *   SWIFT_EXPORT=/path/to/export.csv npm run check:export
 * Optional: SWIFT_INBODY=/path/to/inbody.csv, SWIFT_AS_OF=YYYY-MM-DD, SWIFT_NAMES=1 (show lift names),
 * SWIFT_ENTRIES="Spring cut|2026-03-01|2026-05-24;Current block|2026-07-01|ongoing".
 * The report is printed and written to .vitest/real-export-report.txt (git-ignored).
 */

const AS_OF = "2026-09-11";

describe("the report", async () => {
  const rows = await loadSampleRows();
  const { subjects, unused } = buildProgressSubjects(rows);

  it("hides names unless asked", () => {
    const report = buildReport({ subjects, unused, asOf: AS_OF });
    expect(report).toContain("Names are hidden");
    expect(report).not.toMatch(/Back Squat/i);
    expect(report).toContain("Improving in 8 of 14");
    expect(buildReport({ subjects, unused, asOf: AS_OF, names: true })).toContain("Back Squat");
  });
});

const exportPath = process.env.SWIFT_EXPORT;

describe.skipIf(!exportPath)("the real export", () => {
  it("prints the report", async () => {
    const rows = await parseSugarWodCsv(readFileSync(exportPath as string, "utf8"));
    const { subjects, unused } = buildProgressSubjects(rows);
    const asOf = process.env.SWIFT_AS_OF ?? new Date().toISOString().slice(0, 10);
    let scans: Scan[] | undefined;
    if (process.env.SWIFT_INBODY) {
      const body = await parseInBodyCsv(readFileSync(process.env.SWIFT_INBODY, "utf8"));
      scans = body.flatMap((r) => {
        const d = parseInBodyDate(r.date);
        const w = parseNumericField(r["Weight(lb)"]);
        return d.isValid() && w !== null ? [{ date: d.format("YYYY-MM-DD"), weightLb: w }] : [];
      });
    }
    const entries: EntrySpec[] = (process.env.SWIFT_ENTRIES ?? "").split(";").filter(Boolean).map((part) => {
      const [name = "", start = "", end = ""] = part.split("|").map((x) => x.trim());
      return { name, start, end: end === "" || end === "ongoing" ? null : end };
    });
    const report = buildReport({ subjects, unused, asOf, ...(scans ? { scans } : {}), entries, names: process.env.SWIFT_NAMES === "1" });
    mkdirSync(".vitest", { recursive: true });
    writeFileSync(".vitest/real-export-report.txt", report);
    console.log(`\n${report}\n`);
    expect(subjects.length).toBeGreaterThan(0);
  });
});
