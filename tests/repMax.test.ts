import { describe, expect, it } from "vitest";
import { currentTrackedPrs, parseRepMax, repMaxCategory, repMaxLabel } from "@/lib/analytics/repMax";

describe("parseRepMax", () => {
  it("reads an explicit rep-max notation", () => {
    expect(parseRepMax("Back Squat 1RM")).toBe(1);
    expect(parseRepMax("Deadlift 5-rm")).toBe(5);
  });

  it("reads the last number of a rep ladder as the heaviest effort", () => {
    expect(parseRepMax("10-8-6-4-3-3-2-2-1-1 Clean")).toBe(1);
  });

  it("reads sets x reps shorthand", () => {
    expect(parseRepMax("Back Squat 5x3")).toBe(3);
  });

  it("returns null for plainly-named entries", () => {
    expect(parseRepMax("BACK SQUAT")).toBeNull();
  });
});

describe("repMaxCategory", () => {
  it("maps the four tracked rep-max schemes exactly", () => {
    expect(repMaxCategory(1)).toBe("1RM");
    expect(repMaxCategory(2)).toBe("2RM");
    expect(repMaxCategory(3)).toBe("3RM");
    expect(repMaxCategory(5)).toBe("5RM");
  });

  it("folds everything else into the neutral 'other' category", () => {
    expect(repMaxCategory(4)).toBe("other");
    expect(repMaxCategory(7)).toBe("other");
    expect(repMaxCategory(null)).toBe("other");
  });
});

describe("repMaxLabel", () => {
  it("labels a known rep count exactly, not bucketed", () => {
    expect(repMaxLabel(1)).toBe("1-rep max");
    expect(repMaxLabel(4)).toBe("4-rep max");
    expect(repMaxLabel(7)).toBe("7-rep max");
  });

  it("names an unknown rep scheme plainly", () => {
    expect(repMaxLabel(null)).toBe("rep scheme not specified");
  });
});

describe("currentTrackedPrs", () => {
  it("keeps the highest PR-flagged value per tracked scheme", () => {
    const prs = currentTrackedPrs([
      { value: 200, pr: true, date: "2023-01-01", repMax: 1 },
      { value: 225, pr: true, date: "2024-06-01", repMax: 1 },
      { value: 180, pr: true, date: "2023-05-01", repMax: 5 },
    ]);
    expect(prs).toEqual({
      "1RM": { value: 225, date: "2024-06-01" },
      "5RM": { value: 180, date: "2023-05-01" },
    });
  });

  it("ignores non-PR entries and entries outside the tracked schemes", () => {
    const prs = currentTrackedPrs([
      { value: 300, pr: false, date: "2024-01-01", repMax: 1 },
      { value: 150, pr: true, date: "2024-02-01", repMax: 4 },
      { value: 100, pr: true, date: "2024-03-01", repMax: null },
    ]);
    expect(prs).toEqual({});
  });
});
