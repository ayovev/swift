import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import { buildLiftSubjects } from "@/lib/analytics/plateauDetector";
import { parseInBodyDate, parseNumericField, parseWorkoutDate } from "@/lib/analytics/scanParsing";
import { buildSubjects, classify, round, verdictOf, type Session } from "../scripts/realExportCheck/a1.ts";
import type { EntrySpec, Scan } from "../scripts/realExportCheck/analysis.ts";
import { buildReport } from "../scripts/realExportCheck/report.ts";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * The A1 reference implementation (scripts/realExportCheck), pinned to the figures the spec records for the bundled sample, so
 * the real-export report below can be trusted to mean what the spec means.
 *
 * Running it on a real export (never committed, never uploaded):
 *   SWIFT_EXPORT=/path/to/export.csv npm run check:export
 * Optional: SWIFT_INBODY=/path/to/inbody.csv, SWIFT_AS_OF=YYYY-MM-DD, SWIFT_NAMES=1 (show lift names),
 * SWIFT_ENTRIES="Spring cut|2026-03-01|2026-05-24;Current block|2026-07-01|ongoing".
 * The report is printed and written to .vitest/real-export-report.txt (git-ignored).
 */

const AS_OF = "2026-09-11";

function session(date: string, value: number, maxEffort = false): Session {
  return { date, value, maxEffort };
}

describe("A1 verdict rules (cases from docs/insights-a1-acceptance.md)", () => {
  it("rounds half away from zero to one decimal", () => {
    expect(round(2.25, 1)).toBe(2.3);
    expect(round(-2.25, 1)).toBe(-2.3);
  });

  it("A1-VRD-07: a build cycle is not a decline", () => {
    const s = [
      session("2024-03-05", 170, true), session("2024-06-11", 176), session("2024-09-10", 183, true), session("2024-12-03", 186),
      session("2025-01-10", 195, true), session("2025-02-07", 150), session("2025-03-07", 155), session("2025-04-04", 158), session("2025-05-02", 160),
    ];
    const v = verdictOf(s, false, "lift");
    expect(v?.state).toBe("not-tested-since");
    expect(v?.window).toBe(4);
  });

  it("A1-VRD-08: a failed test is a decline", () => {
    const s = [
      session("2024-03-05", 170, true), session("2024-06-11", 176), session("2024-09-10", 183, true), session("2024-12-03", 186),
      session("2025-01-10", 195, true), session("2025-02-07", 150), session("2025-03-07", 155), session("2025-04-04", 158), session("2025-05-02", 175, true),
    ];
    expect(verdictOf(s, false, "lift")?.state).toBe("down");
  });

  it("needs 6 sessions", () => {
    expect(verdictOf([session("2025-01-10", 100), session("2025-02-10", 101)], false, "lift")).toBeNull();
  });
});

describe("the bundled sample, as of 2026-09-11", async () => {
  const rows = await loadSampleRows();
  const { subjects, unused } = buildSubjects(rows);
  const { rows: classified, headline } = classify(subjects, AS_OF);

  it("builds the same lift entries as the app's buildLiftSubjects", () => {
    const dated = rows.flatMap((raw) => {
      const d = parseWorkoutDate(raw.date);
      return d.isValid() ? [{ date: d, raw }] : [];
    });
    const app = buildLiftSubjects(dated, { maxReps: 8 });
    const mine = subjects.filter((s) => s.kind === "lift");
    expect(mine.length).toBe(app.length);
    for (const c of app) {
      const key = `${c.subject.name.trim().toLowerCase().replace(/s$/, "")}|${c.subject.status}`;
      const found = mine.find((s) => s.key === key);
      expect(found, key).toBeDefined();
      const a = c.entries.map((e) => `${e.date.format("YYYY-MM-DD")}:${e.value.toFixed(6)}`).sort();
      const b = (found?.entries ?? []).map((e) => `${e.date}:${e.value.toFixed(6)}`).sort();
      expect(b, key).toEqual(a);
    }
  });

  it("finds 45 subjects", () => {
    expect(subjects.length).toBe(45);
  });

  it("accounts for the 272 of 526 unused weight entries the spec reports (210 no readable scheme, 15 outside 1 to 8, 47 no lift named)", () => {
    expect(unused.loadRows).toBe(526);
    expect(unused.loadRows - unused.used).toBe(272);
    expect({ noScheme: unused.noScheme, outsideRange: unused.outsideRange, noLiftNamed: unused.noLiftNamed }).toEqual({ noScheme: 210, outsideRange: 15, noLiftNamed: 47 });
  });

  it("reads 89 of 246 lift sessions as max efforts, as the spec reports", () => {
    const lifts = subjects.filter((s) => s.kind === "lift");
    expect(lifts.reduce((n, s) => n + s.sessions.length, 0)).toBe(246);
    expect(lifts.reduce((n, s) => n + s.sessions.filter((x) => x.maxEffort).length, 0)).toBe(89);
  });

  it("puts every subject in one group: 8 up, 1 down, 5 no clear change, 11 fewer than 6, 20 not recent", () => {
    const count = (g: string): number => classified.filter((r) => r.group === g).length;
    expect({ up: count("up"), down: count("down"), nts: count("not-tested-since"), nc: count("no-clear-change"), few: count("few"), notRecent: count("not-recent") })
      .toEqual({ up: 8, down: 1, nts: 0, nc: 5, few: 11, notRecent: 20 });
  });

  it("reads Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1 down)", () => {
    expect(headline.label).toBe("Improving");
    expect(headline.sentence).toBe("Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1 down).");
    expect(headline.moveUps).toBe(2);
    expect(headline.leftOut.under6).toBe(31);
  });

  it("reproduces the spec's per-subject verdicts", () => {
    const state = (key: string): string | undefined => classified.find((r) => r.subject.key === key)?.group;
    expect(state("power snatch|RX")).toBe("up");
    expect(state("deadlift|RX")).toBe("up");
    expect(state("snatch|RX")).toBe("no-clear-change");
    expect(state("back squat|RX")).toBe("no-clear-change");
    expect(state("nancy|SCALED")).toBe("down");
  });

  it("builds a report with no names unless asked", () => {
    const report = buildReport({ subjects, unused, asOf: AS_OF });
    expect(report).toContain("Names are hidden");
    expect(report).not.toMatch(/Back Squat/i);
    expect(report).toContain("Improving in 8 of 14");
    const named = buildReport({ subjects, unused, asOf: AS_OF, names: true });
    expect(named).toContain("Back Squat");
  });
});

const exportPath = process.env.SWIFT_EXPORT;

describe.skipIf(!exportPath)("the real export", () => {
  it("prints the report", async () => {
    const rows = await parseSugarWodCsv(readFileSync(exportPath as string, "utf8"));
    const { subjects, unused } = buildSubjects(rows);
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
