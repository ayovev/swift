import { describe, expect, it } from "vitest";
import {
  EMPTY_ENTRY_INPUT,
  entriesOverlap,
  entryEnd,
  entryFromInput,
  entryName,
  entrySpanText,
  inputFromEntry,
  overlappingEntries,
  validateEntryInput,
  validateEntryList,
  type EntryInput,
} from "@/lib/analytics/timeline";
import type { TimelineEntry } from "@/types/timeline";

const TODAY = "2026-09-11";
const entry = (over: Partial<TimelineEntry> & { id: string; startDate: string }): TimelineEntry => ({
  initiation: "changed",
  area: "training",
  endDate: null,
  ...over,
});
const valid: EntryInput = { ...EMPTY_ENTRY_INPUT, initiation: "changed", area: "nutrition", startDate: "2026-03-01", ongoing: true };

describe("the entry form's rules (A1-TLN-11 to 17)", () => {
  it("TLN-11 starts with nothing chosen: no kind, no area, no dates, Ongoing ticked", () => {
    expect(EMPTY_ENTRY_INPUT).toEqual({ initiation: "", area: "", startDate: "", endDate: "", ongoing: true, name: "", note: "" });
  });

  it("TLN-12 lists every failing rule in plain sentences, in form order", () => {
    expect(validateEntryInput(EMPTY_ENTRY_INPUT, TODAY)).toEqual([
      "Choose whether you changed it or it happened.",
      "Choose what it touches.",
      "Add a start date.",
    ]);
  });

  it("TLN-13 refuses a start date after today, and an end date before the start or missing when Ongoing is off", () => {
    expect(validateEntryInput({ ...valid, startDate: "2026-09-12" }, TODAY)).toEqual(["The start date is after today."]);
    expect(validateEntryInput({ ...valid, ongoing: false }, TODAY)).toEqual(["Add an end date, or tick Ongoing."]);
    expect(validateEntryInput({ ...valid, ongoing: false, endDate: "2026-02-28" }, TODAY)).toEqual(["The end date is before the start date."]);
  });

  it("TLN-14 accepts a single day, entered as the start date again", () => {
    expect(validateEntryInput({ ...valid, ongoing: false, endDate: "2026-03-01" }, TODAY)).toEqual([]);
  });

  it("TLN-15 refuses a note over 200 characters, and counts it trimmed", () => {
    expect(validateEntryInput({ ...valid, note: "x".repeat(201) }, TODAY)).toEqual(["The note is over 200 characters."]);
    expect(validateEntryInput({ ...valid, note: `${"x".repeat(200)}   ` }, TODAY)).toEqual([]);
  });

  it("TLN-16 builds the entry: name and note trimmed and dropped when empty, Ongoing is a null end", () => {
    expect(entryFromInput({ ...valid, name: "  Spring cut ", note: " " }, "a")).toEqual({
      id: "a",
      initiation: "changed",
      area: "nutrition",
      name: "Spring cut",
      startDate: "2026-03-01",
      endDate: null,
    });
    expect(entryFromInput({ ...valid, ongoing: false, endDate: "2026-04-01" }, "a").endDate).toBe("2026-04-01");
  });

  it("TLN-17 edits round-trip: an entry becomes the input that rebuilds it", () => {
    const e = entry({ id: "a", startDate: "2026-03-01", endDate: "2026-04-01", name: "Cut", note: "n" });
    expect(entryFromInput(inputFromEntry(e), "a")).toEqual(e);
    expect(inputFromEntry(entry({ id: "b", startDate: "2026-03-01" })).ongoing).toBe(true);
  });
});

describe("names, spans and overlap", () => {
  it("reads an unnamed entry by its area", () => {
    expect(entryName(entry({ id: "a", startDate: "2026-01-01", area: "nutrition" }))).toBe("Nutrition");
    expect(entryName(entry({ id: "a", startDate: "2026-01-01", name: "  Spring cut " }))).toBe("Spring cut");
  });

  it("writes a span as a range, a single day, or ongoing since a month", () => {
    expect(entrySpanText(entry({ id: "a", startDate: "2026-03-01", endDate: "2026-04-02" }))).toBe("Mar 1, 2026 to Apr 2, 2026");
    expect(entrySpanText(entry({ id: "a", startDate: "2026-03-01", endDate: "2026-03-01" }))).toBe("Mar 1, 2026");
    expect(entrySpanText(entry({ id: "a", startDate: "2026-03-01" }))).toBe("Ongoing since Mar 2026");
  });

  it("TLN-31 runs an ongoing entry to the reference date, and overlap counts a shared day", () => {
    const a = entry({ id: "a", startDate: "2026-03-01", endDate: "2026-03-31" });
    const b = entry({ id: "b", startDate: "2026-03-31", endDate: "2026-04-10" });
    const c = entry({ id: "c", startDate: "2026-04-01" });
    expect(entryEnd(c, TODAY)).toBe(TODAY);
    expect(entriesOverlap(a, b, TODAY)).toBe(true);
    expect(entriesOverlap(a, c, TODAY)).toBe(false);
    expect(overlappingEntries(c, [a, b, c], TODAY).map((e) => e.id)).toEqual(["b"]);
  });

});

describe("a list that arrives (validateEntryList)", () => {
  it("accepts a good list, drops unknown keys and a stored baselineStart", () => {
    const e = entry({ id: "a", startDate: "2026-03-01", name: "Cut" });
    const result = validateEntryList([{ ...e, secret: 1, baselineStart: "2026-01-01" }]);
    expect(result).toEqual({ status: "ok", entries: [e] });
  });

  it("checks shape only: a start date after today is fine here", () => {
    expect(validateEntryList([entry({ id: "a", startDate: "2999-01-01" })]).status).toBe("ok");
  });

  it.each([
    ["not a list", "x", /list of timeline entries/],
    ["no id", [{ initiation: "changed" }], /Entry 1 has no id/],
    ["a repeated id", [entry({ id: "a", startDate: "2026-01-01" }), entry({ id: "a", startDate: "2026-01-02" })], /Entry 2 repeats an id/],
    ["an unknown kind", [{ ...entry({ id: "a", startDate: "2026-01-01" }), initiation: "x" }], /unknown kind/],
    ["an unknown area", [{ ...entry({ id: "a", startDate: "2026-01-01" }), area: "x" }], /unknown area/],
    ["a bad start", [{ ...entry({ id: "a", startDate: "2026-01-01" }), startDate: "03/01/2026" }], /no valid start date/],
    ["a bad end", [{ ...entry({ id: "a", startDate: "2026-01-01" }), endDate: "soon" }], /end date that isn't/],
    ["an end before the start", [entry({ id: "a", startDate: "2026-02-01", endDate: "2026-01-01" })], /ends before it starts/],
  ])("rejects %s with a sentence naming the entry", (_name, list, reason) => {
    const result = validateEntryList(list);
    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.reason).toMatch(reason);
  });

});
