import { describe, expect, it } from "vitest";
import { countNewRows } from "@/lib/analytics/newRows";
import { logRow } from "./fixtures/rows";

const a = logRow("01/05/2026", "FRAN", "21-15-9");
const b = logRow("01/06/2026", "GRACE", "30 clean and jerks");
const c = logRow("01/07/2026", "CINDY", "20 min AMRAP");

describe("countNewRows", () => {
  it("counts entries the previous export did not have", () => {
    expect(countNewRows([a, b], [a, b, c])).toBe(1);
  });

  it("is zero for the same export again", () => {
    expect(countNewRows([a, b], [a, b])).toBe(0);
  });

  it("is order-independent", () => {
    expect(countNewRows([a, b], [b, a])).toBe(0);
  });

  it("treats the same class logged twice on one day as two entries", () => {
    expect(countNewRows([a], [a, a])).toBe(1);
  });

  it("is zero when the new export is smaller than the old one", () => {
    expect(countNewRows([a, b, c], [a])).toBe(0);
  });
});
