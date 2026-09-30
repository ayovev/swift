import { describe, expect, it } from "vitest";
import { getAlignment } from "@/lib/analytics/alignment";
import { getPlateauInsights } from "@/lib/analytics/plateauDetector";
import type { ContextTag } from "@/types/tag";
import { liftRow, scanRow } from "./fixtures/rows";

const AS_OF = new Date("2027-01-01");

// Three lifts, each declining across Jan-Mar 2024, so Alignment's gate passes too.
const workouts = ["Overhead Squat", "Back Squat", "Deadlift"].flatMap((lift) => [
  liftRow("01/01/2024", lift, 100),
  liftRow("02/01/2024", lift, 100),
  liftRow("03/01/2024", lift, 80),
]);
const scans = [
  scanRow("2024-02-01", { "Skeletal Muscle Mass(lb)": "90", "Body Fat Mass(lb)": "25" }),
  scanRow("2024-03-01", { "Skeletal Muscle Mass(lb)": "80", "Body Fat Mass(lb)": "35" }),
];

const cut: ContextTag = { id: "c", type: "cut", label: "Winter cut", startDate: "2024-02-01", endDate: "2024-03-15" };
const injury: ContextTag = { id: "i", type: "injury", label: "Wrist", startDate: "2024-02-20", endDate: null };
const travel: ContextTag = { id: "t", type: "travel", label: "Trip", startDate: "2024-01-01", endDate: "2024-03-31" };
const farAway: ContextTag = { id: "f", type: "cut", startDate: "2020-01-01", endDate: "2020-03-01" };

describe("Plateau Detector with tags", () => {
  const plain = getPlateauInsights(workouts, scans, AS_OF);

  it("produces exactly the untagged output with no tags, an empty list, or tags outside the window", () => {
    expect(getPlateauInsights(workouts, scans, AS_OF, { tags: [] })).toEqual(plain);
    expect(getPlateauInsights(workouts, scans, AS_OF, { tags: [farAway] })).toEqual(plain);
    expect(plain.every((i) => !("tagNotes" in i))).toBe(true);
  });

  it("adds a sentence naming an overlapping cut or injury tag to a plateaued result, and changes nothing else", () => {
    const tagged = getPlateauInsights(workouts, scans, AS_OF, { tags: [cut, injury, travel] });
    tagged.forEach((insight, i) => {
      const { tagNotes, ...rest } = insight;
      expect(rest).toEqual(plain[i]);
      expect(tagNotes).toHaveLength(2);
      expect(tagNotes![0]).toMatch(/"Winter cut" \(cut/);
      expect(tagNotes![1]).toMatch(/"Wrist" \(injury/);
      expect(tagNotes!.join(" ")).not.toMatch(/Trip/);
    });
  });

  it("acknowledges an open-ended tag that started before the window ended", () => {
    const tagged = getPlateauInsights(workouts, scans, AS_OF, { tags: [injury] });
    expect(tagged[0]!.tagNotes?.[0]).toMatch(/ongoing/);
  });

  it("leaves an improving result unannotated", () => {
    const improving = ["Overhead Squat"].flatMap((lift) => [liftRow("01/01/2024", lift, 80), liftRow("02/01/2024", lift, 90), liftRow("03/01/2024", lift, 100)]);
    const tagged = getPlateauInsights(improving, scans, AS_OF, { tags: [cut] });
    expect(tagged[0]!.classification).toBe("improving");
    expect(tagged[0]!.tagNotes).toBeUndefined();
  });
});

describe("Alignment with tags", () => {
  const insights = getPlateauInsights(workouts, scans, AS_OF);
  const plain = getAlignment(insights, scans, AS_OF);

  it("is unchanged without an overlapping tag", () => {
    expect(getAlignment(insights, scans, AS_OF, { tags: [] })).toEqual(plain);
    expect(getAlignment(insights, scans, AS_OF, { tags: [farAway, travel] })).toEqual(plain);
    expect("tagNotes" in plain).toBe(false);
  });

  it("names an overlapping cut in a sentence and leaves the classification alone", () => {
    const tagged = getAlignment(insights, scans, AS_OF, { tags: [cut] });
    const { tagNotes, ...rest } = tagged;
    expect(rest).toEqual(plain);
    expect(plain.classification).not.toBe("insufficient_data");
    expect(tagNotes).toHaveLength(1);
    expect(tagNotes![0]).toMatch(/"Winter cut"/);
  });
});
