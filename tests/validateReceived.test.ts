import { describe, expect, it } from "vitest";
import { validateBodyCompRows, validateExperiments, validateWorkoutRows } from "@/lib/sync/validateReceived";
import type { Experiment } from "@/types/experiment";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";
import { loadSampleRows } from "./fixtures/sampleRows";
import { scanRow, workoutRow } from "./fixtures/rows";

const okRow = () => ({ ...workoutRow({ date: "03/05/2024", title: "FRAN" }) });

/** Round-trip through JSON, which is exactly how a dataset crosses the wire. */
const wire = <T,>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe("validateWorkoutRows", () => {
  it("accepts the real sample export exactly as its parser produced it, after crossing the wire", async () => {
    const rows = await loadSampleRows();
    const result = validateWorkoutRows(wire(rows));
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.value).toEqual(rows);
  });

  it("fills the two optional columns a slim export lacks, and keeps columns it doesn't know", () => {
    const { set_details: _s, notes: _n, ...slim } = okRow();
    const result = validateWorkoutRows([{ ...slim, extra_column: "kept" }]);
    expect(result.status === "ok" && result.value[0]).toMatchObject({ set_details: "", notes: "", extra_column: "kept" });
  });

  it.each([
    ["not a list", { rows: [] }, /isn't a list/],
    ["empty", [], /is empty/],
    ["a row that isn't an object", [okRow(), "nope"], /Row 2 of the workout log isn't a set of columns/],
    ["an array row", [[1, 2]], /Row 1 .* isn't a set of columns/],
    ["a missing required column", [(({ title: _t, ...rest }) => rest)(okRow())], /Row 1 .* has no "title" column/],
    ["a cell that isn't text", [{ ...okRow(), best_result_raw: 225 }], /Row 1 .* "best_result_raw" that isn't text/],
    ["an extra column that isn't text", [{ ...okRow(), extra: { a: 1 } }], /"extra" that isn't text/],
    ["an unreadable date", [okRow(), { ...okRow(), date: "2024-03-05" }], /Row 2 .* unreadable date/],
    ["null", null, /isn't a list/],
  ])("rejects %s, naming what is wrong", (_name, input, message) => {
    const result = validateWorkoutRows(input);
    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.reason).toMatch(message);
  });

  it("rejects a __proto__ column", () => {
    const evil = JSON.parse('{"date":"03/05/2024","title":"x","description":"","best_result_raw":"","best_result_display":"","score_type":"","barbell_lift":"","rx_or_scaled":"","pr":"","__proto__":"x"}');
    expect(validateWorkoutRows([evil]).status).toBe("invalid");
  });

  it("is all-or-nothing: one bad row rejects the whole dataset", () => {
    const rows = [...Array.from({ length: 50 }, okRow), { ...okRow(), date: "" }];
    expect(validateWorkoutRows(rows).status).toBe("invalid");
  });
});

describe("validateBodyCompRows", () => {
  it("accepts the InBody fixture as its parser produced it, extra columns included", async () => {
    const rows = await loadSampleInBodyRows();
    const result = validateBodyCompRows(wire(rows));
    expect(result.status === "ok" && result.value).toEqual(rows);
    expect(Object.keys(rows[0]!).length).toBeGreaterThan(8);
  });

  it("fills typed metric columns a slim export lacks with InBody's own 'not measured' marker", () => {
    const result = validateBodyCompRows([{ date: "20260401093000", "Weight(lb)": "180" }]);
    expect(result.status === "ok" && result.value[0]).toMatchObject({ "Body Fat Mass(lb)": "-", "InBody Score": "-" });
  });

  it.each([
    ["a timestamp that isn't 14 digits", [scanRow("2026-04-01", { "Weight(lb)": "180" }), { ...scanRow("2026-04-01"), date: "2026-04-01" }], /Row 2 .* unreadable date/],
    ["no weight column", [{ date: "20260401093000" }], /has no "Weight\(lb\)" column/],
    ["empty", [], /is empty/],
    ["a numeric cell", [{ date: "20260401093000", "Weight(lb)": 180 }], /"Weight\(lb\)" that isn't text/],
  ])("rejects %s", (_name, input, message) => {
    const result = validateBodyCompRows(input);
    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.reason).toMatch(message);
  });
});

describe("validateExperiments", () => {
  const exp = (over: Record<string, unknown> = {}) => ({ id: "a", date: "2024-05-01", label: "5/3/1", ...over });

  it("accepts experiments with and without an end date and a baseline, and rebuilds them without stray keys", () => {
    const list: Experiment[] = [
      { id: "a", date: "2024-05-01", label: "One" },
      { id: "b", date: "2024-06-01", endDate: "2024-07-01", baselineStart: "2024-04-01", label: "Two" },
    ];
    expect(validateExperiments(wire(list))).toEqual({ status: "ok", value: list });
    expect(validateExperiments([exp({ secret: "x" })])).toEqual({ status: "ok", value: [{ id: "a", date: "2024-05-01", label: "5/3/1" }] });
  });

  it("accepts an empty list", () => {
    expect(validateExperiments([])).toEqual({ status: "ok", value: [] });
  });

  it.each([
    ["not a list", "x", /isn't a list/],
    ["a non-object", [null], /Experiment 1 isn't an object/],
    ["no id", [exp({ id: "" })], /no id/],
    ["a repeated id", [exp(), exp()], /Experiment 2 repeats an id/],
    ["a bad start date", [exp({ date: "5/1/2024" })], /no valid start date/],
    ["an impossible date", [exp({ date: "2024-02-31" })], /no valid start date/],
    ["no label", [exp({ label: "  " })], /no label/],
    ["a bad end date", [exp({ endDate: "soon" })], /end date that isn't a date/],
    ["a bad baseline", [exp({ baselineStart: 5 })], /earlier-range start that isn't a date/],
  ])("rejects %s", (_name, input, message) => {
    const result = validateExperiments(input);
    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.reason).toMatch(message);
  });
});
