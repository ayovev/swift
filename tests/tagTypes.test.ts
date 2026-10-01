import { describe, expect, it } from "vitest";
import {
  CHANGE_TYPES,
  TAG_GROUPS,
  TAG_TYPES,
  TAG_TYPE_LABEL,
  groupOfType,
  isChangeType,
  type TagType,
} from "@/types/tag";

describe("tag types and their groups", () => {
  it("places every type in exactly one group and one domain, with nothing extra", () => {
    const placed = TAG_GROUPS.flatMap((g) => g.categories.flatMap((c) => c.types));
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(Object.keys(TAG_TYPE_LABEL).sort());
    expect([...TAG_TYPES].sort()).toEqual([...placed].sort());
  });

  it("splits something you changed into nutrition, programming, recovery and something else", () => {
    const changed = TAG_GROUPS.find((g) => g.id === "changed")!;
    expect(changed.label).toBe("Something you changed");
    expect(changed.categories.map((c) => [c.label, c.types])).toEqual([
      ["Nutrition", ["nutrition", "cut", "bulk", "maintain"]],
      ["Programming", ["programming", "cycle", "deload"]],
      ["Recovery", ["recovery"]],
      ["Something else", ["experiment", "other"]],
    ]);
  });

  it("gives every domain a generic catch-all, so an unsure athlete can pick it", () => {
    const changed = TAG_GROUPS.find((g) => g.id === "changed")!;
    const catchAll: Record<string, TagType> = { Nutrition: "nutrition", Programming: "programming", Recovery: "recovery" };
    for (const category of changed.categories) {
      const generic = catchAll[category.label ?? ""];
      if (generic) expect(category.types).toContain(generic);
    }
  });

  it("keeps something that happened to injury and travel, with no domains", () => {
    const happened = TAG_GROUPS.find((g) => g.id === "happened")!;
    expect(happened.label).toBe("Something that happened");
    expect(happened.categories).toEqual([{ types: ["injury", "travel"] }]);
  });

  it("treats exactly the types in something you changed as things you changed", () => {
    expect([...CHANGE_TYPES].sort()).toEqual(
      ["nutrition", "cut", "bulk", "maintain", "programming", "cycle", "deload", "recovery", "experiment", "other"].sort()
    );
    for (const type of TAG_TYPES) expect(isChangeType(type)).toBe(CHANGE_TYPES.includes(type));
    expect(isChangeType("injury")).toBe(false);
    expect(isChangeType("travel")).toBe(false);
  });

  it("finds a type's group, and each group's default is one of its own types", () => {
    expect(groupOfType("deload").id).toBe("changed");
    expect(groupOfType("travel").id).toBe("happened");
    for (const group of TAG_GROUPS) expect(groupOfType(group.defaultType).id).toBe(group.id);
  });

  it("names every type in plain words", () => {
    expect(TAG_TYPE_LABEL.nutrition).toBe("Nutrition change");
    expect(TAG_TYPE_LABEL.programming).toBe("Programming change");
    expect(TAG_TYPE_LABEL.cycle).toBe("New cycle");
    expect(TAG_TYPE_LABEL.recovery).toBe("Recovery change");
    for (const label of Object.values(TAG_TYPE_LABEL)) expect(label).not.toMatch(/!/);
  });
});
