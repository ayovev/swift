import { describe, expect, it } from "vitest";
import { formatSignedDelta } from "@/components/dashboard/charts/chartUtils";
import { formatDay, formatPercent } from "@/lib/analytics/formatting";

describe("formatSignedDelta", () => {
  it("rounds to one decimal, adds an explicit plus, and says 'no data' for null", () => {
    expect(formatSignedDelta(1.234, " lb")).toBe("+1.2 lb");
    expect(formatSignedDelta(-0.44, "%")).toBe("-0.4%");
    expect(formatSignedDelta(0, " lb")).toBe("0 lb");
    expect(formatSignedDelta(null, " lb")).toBe("no data");
  });
});

describe("insight sentence formatting", () => {
  it("formats a day the way the UI does", () => {
    expect(formatDay("2026-03-01")).toBe("Mar 1, 2026");
  });
  it("formats a fraction as an unsigned whole percent", () => {
    expect(formatPercent(0.126)).toBe("13%");
    expect(formatPercent(-0.126)).toBe("13%");
    expect(formatPercent(0)).toBe("0%");
  });
});
