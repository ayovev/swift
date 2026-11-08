import { describe, expect, it } from "vitest";
import { formatDay } from "@/lib/analytics/formatting";

describe("insight sentence formatting", () => {
  it("formats a day the way the UI does", () => {
    expect(formatDay("2026-03-01")).toBe("Mar 1, 2026");
  });
});
