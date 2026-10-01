import { describe, expect, it } from "vitest";
import {
  validateTagList,
  VERDICT_NOTE,
  acknowledgeTags,
  describeTag,
  overlappingTags,
  tagLabel,
  tagOverlaps,
} from "@/lib/analytics/contextTags";
import { TAG_TYPES, type ContextTag } from "@/types/tag";

/** `undefined` in `over` removes the key, which is how "no label" is spelled under exactOptionalPropertyTypes. */
const tag = (over: { [K in keyof ContextTag]?: ContextTag[K] | undefined } = {}): ContextTag => {
  const merged: Record<string, unknown> = {
    id: "t1",
    type: "cut",
    label: "Spring cut",
    startDate: "2026-03-01",
    endDate: "2026-04-30",
    ...over,
  };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  return merged as unknown as ContextTag;
};

describe("tagOverlaps", () => {
  it("is true for a tag inside, straddling or containing the window", () => {
    expect(tagOverlaps(tag(), "2026-03-10", "2026-03-20")).toBe(true);
    expect(tagOverlaps(tag(), "2026-02-01", "2026-03-01")).toBe(true); // touches on the start day
    expect(tagOverlaps(tag(), "2026-04-30", "2026-06-01")).toBe(true); // touches on the end day
    expect(tagOverlaps(tag(), "2026-01-01", "2026-12-31")).toBe(true);
  });

  it("is false for a tag wholly outside the window (outside the data range)", () => {
    expect(tagOverlaps(tag(), "2026-01-01", "2026-02-28")).toBe(false);
    expect(tagOverlaps(tag(), "2026-05-01", "2026-06-01")).toBe(false);
    expect(tagOverlaps(tag({ startDate: "2019-01-01", endDate: "2019-02-01" }), "2026-01-01", "2026-02-01")).toBe(false);
  });

  it("treats an open-ended tag as running from its start onward", () => {
    const open = tag({ endDate: null });
    expect(tagOverlaps(open, "2030-01-01", "2030-02-01")).toBe(true);
    expect(tagOverlaps(open, "2026-01-01", "2026-02-28")).toBe(false);
  });

  it("ignores a tag with an unparseable date rather than throwing", () => {
    expect(tagOverlaps(tag({ startDate: "nope" }), "2026-01-01", "2026-12-31")).toBe(false);
  });
});

describe("overlappingTags", () => {
  const tags = [
    tag({ id: "b", type: "injury", label: "Shoulder", startDate: "2026-03-15", endDate: "2026-03-20" }),
    tag({ id: "a" }),
    tag({ id: "c", type: "travel", label: "Trip", startDate: "2026-03-05", endDate: "2026-03-07" }),
  ];
  it("returns overlapping tags in start-date order, optionally filtered by type", () => {
    expect(overlappingTags(tags, "2026-03-01", "2026-03-31").map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(overlappingTags(tags, "2026-03-01", "2026-03-31", ["injury"]).map((t) => t.id)).toEqual(["b"]);
  });
  it("handles several tags overlapping each other", () => {
    expect(overlappingTags(tags, "2026-03-16", "2026-03-17").map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("naming", () => {
  it("falls back to the type when there is no label", () => {
    expect(tagLabel(tag({ label: undefined }))).toBe("cut");
    expect(tagLabel(tag({ label: "  " }))).toBe("cut");
    expect(describeTag(tag({ label: undefined, endDate: null }))).toBe("cut period (Mar 1, 2026 – ongoing)");
    expect(describeTag(tag())).toBe('"Spring cut" (cut, Mar 1, 2026 – Apr 30, 2026)');
  });
});

describe("acknowledgeTags", () => {
  it("names each overlapping cut or injury tag, and only those", () => {
    const tags = [tag(), tag({ id: "i", type: "injury", label: "Elbow", startDate: "2026-03-10", endDate: null }), tag({ id: "tr", type: "travel", startDate: "2026-03-10", endDate: "2026-03-11" })];
    const notes = acknowledgeTags(tags, "2026-03-01", "2026-03-31", "window");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/"Spring cut" \(cut/);
    expect(notes[1]).toMatch(/"Elbow" \(injury/);
    expect(notes.join(" ")).not.toMatch(/travel/);
  });
  it("returns nothing with no tags, no overlap, or no window", () => {
    expect(acknowledgeTags(undefined, "2026-03-01", "2026-03-31", "window")).toEqual([]);
    expect(acknowledgeTags([], "2026-03-01", "2026-03-31", "window")).toEqual([]);
    expect(acknowledgeTags([tag()], "2025-01-01", "2025-02-01", "window")).toEqual([]);
    expect(acknowledgeTags([tag()], "", "", "window")).toEqual([]);
  });
});

describe("the newer types", () => {
  it("name an unnamed period by its type, in plain words", () => {
    expect(tagLabel(tag({ label: undefined, type: "cycle" }))).toBe("new cycle");
    expect(tagLabel(tag({ label: undefined, type: "nutrition" }))).toBe("nutrition change");
    expect(describeTag(tag({ label: undefined, type: "recovery", endDate: null }))).toBe("recovery change period (Mar 1, 2026 – ongoing)");
    expect(describeTag(tag({ label: "Added creatine", type: "nutrition", endDate: null }))).toBe('"Added creatine" (nutrition change, Mar 1, 2026 – ongoing)');
  });

  it("have a note for a cut's verdict and for nothing else", () => {
    expect(VERDICT_NOTE.cut).toBe("Lifts and lean mass often move differently during a cut.");
    expect(Object.keys(VERDICT_NOTE)).toEqual(["cut"]);
  });
});

describe("validateTagList", () => {
  it("accepts every type there is", () => {
    for (const type of TAG_TYPES) {
      expect(validateTagList([tag({ type })])).toEqual({ status: "ok", tags: [tag({ type })] });
    }
  });

  const ok = (list: unknown) => validateTagList(list);

  it("accepts a valid list unchanged, including an open-ended one", () => {
    const tags = [tag(), tag({ id: "x", type: "other", label: undefined, note: "sleep was bad", endDate: null })];
    expect(ok(tags)).toEqual({ status: "ok", tags });
  });

  it.each([
    ["no list", {}, /doesn't contain a list/],
    ["bad type", [tag({ type: "nap" as never })], /Period 1 has an unknown type/],
    ["bad date", [tag({ startDate: "3/1/2026" })], /Period 1 has no valid start date/],
    ["end before start", [tag({ endDate: "2026-02-01" })], /Period 1 ends before it starts/],
    ["duplicate id", [tag(), tag()], /Period 2 repeats an id/],
    ["no id", [{ ...tag(), id: "" }], /Period 1 has no id/],
    ["bad compare-against date", [tag({ baselineStart: "Feb 1" })], /Period 1 has a compare-against start that isn't YYYY-MM-DD/],
  ])("rejects %s with a sentence naming the problem", (_name, list, message) => {
    const r = ok(list);
    expect(r.status).toBe("invalid");
    expect(r.status === "invalid" && r.reason).toMatch(message);
  });

  it("keeps an experiment's compare-against start", () => {
    const experiment = tag({ type: "experiment", label: "Started 5/3/1", baselineStart: "2026-02-01" });
    expect(ok([experiment])).toEqual({ status: "ok", tags: [experiment] });
  });

  it("drops unknown keys", () => {
    expect(ok([{ ...tag(), secret: "x" }])).toEqual({ status: "ok", tags: [tag()] });
  });
});
