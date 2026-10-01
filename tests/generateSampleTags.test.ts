import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { describe, expect, it } from "vitest";
import { getCycles } from "@/lib/analytics/cycleReport";
import { validateTagList } from "@/lib/analytics/contextTags";
import { generateSampleTags } from "@/lib/sample/generateSampleTags";
import { workoutRow } from "./fixtures/rows";

dayjs.extend(customParseFormat);

const rows = [workoutRow({ date: "11/21/2022", title: "FRAN" })];
const today = dayjs("2026-09-25");

describe("generateSampleTags", () => {
  it("returns [] when no row has a valid date", () => {
    expect(generateSampleTags([workoutRow({ date: "", title: "X" }), workoutRow({ date: "nope", title: "Y" })], today)).toEqual([]);
  });

  it("returns [] when the history is too short to fit any tag, even the current block", () => {
    expect(generateSampleTags([workoutRow({ date: "09/15/2026", title: "X" })], today)).toEqual([]);
  });

  it("gives a short history only the current block, not the dated ones that don't fit", () => {
    const tags = generateSampleTags([workoutRow({ date: "06/01/2026", title: "X" })], today);
    expect(tags.map((t) => t.label)).toEqual(["Current block"]);
  });

  it("is deterministic and never mutates its input", () => {
    const snapshot = JSON.parse(JSON.stringify(rows));
    expect(generateSampleTags(rows, today)).toEqual(generateSampleTags(rows, today));
    expect(rows).toEqual(snapshot);
  });

  it("produces valid tags, with unique ids, that survive the same validation an import does", () => {
    const tags = generateSampleTags(rows, today);
    expect(tags.length).toBeGreaterThan(3);
    expect(new Set(tags.map((t) => t.id)).size).toBe(tags.length);
    expect(validateTagList(JSON.parse(JSON.stringify(tags)))).toEqual({ status: "ok", tags });
  });

  it("covers a type from every domain of something you changed, plus context (injury, travel)", () => {
    const types = new Set(generateSampleTags(rows, today).map((t) => t.type));
    for (const t of ["bulk", "cut", "maintain", "nutrition", "programming", "cycle", "recovery", "injury", "travel"]) expect(types.has(t as never)).toBe(true);
  });

  it("keeps every tag inside the logged span, ending well before today, except one open-ended current block", () => {
    const first = dayjs("2022-11-21");
    const tags = generateSampleTags(rows, today);
    const open = tags.filter((t) => t.endDate === null);
    expect(open).toHaveLength(1);
    expect(open[0]!.label).toBe("Current block");
    for (const t of tags) {
      expect(dayjs(t.startDate).isAfter(first)).toBe(true);
      expect(dayjs(t.startDate).isBefore(today)).toBe(true);
      if (t.endDate) expect(today.diff(dayjs(t.endDate), "day")).toBeGreaterThanOrEqual(28);
    }
  });

  it("keeps the blocks in order and not overlapping each other, so the cycles read cleanly", () => {
    const blocks = generateSampleTags(rows, today).filter((t) => ["bulk", "cut", "maintain", "nutrition", "programming", "cycle", "recovery"].includes(t.type));
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]!.startDate > (blocks[i - 1]!.endDate ?? "9999")).toBe(true);
    }
  });

  it("anchors to the athlete's own first workout, not fixed calendar dates", () => {
    const shifted = generateSampleTags([workoutRow({ date: "01/01/2021", title: "FRAN" })], today);
    const base = generateSampleTags(rows, today);
    expect(shifted[0]!.startDate).not.toBe(base[0]!.startDate);
  });

  it("gives the Cycles view real blocks to report on", () => {
    const tags = generateSampleTags(rows, today);
    const cycles = getCycles(rows, tags, { asOfDate: today.toDate() });
    expect(cycles.map((c) => c.label)).toEqual([
      "First bulk",
      "First cut",
      "Started 5/3/1",
      "5/3/1, cycle 2",
      "Maintenance block",
      "Switched to a protein-forward diet",
      "Started tracking sleep",
      "Current block",
    ]);
  });
});
