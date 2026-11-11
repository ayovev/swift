import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIME_AXIS_PROPS } from "@/components/dashboard/charts/chartUtils";

/**
 * Every chart's time axis uses one label angle, TIME_AXIS_PROPS (chartUtils.ts): angled so labels don't collide as the grouping gets
 * finer, and the same on every chart. Recharts draws nothing in jsdom, so this reads the source: every <XAxis> spreads it.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("time axes", () => {
  it("are angled at -35 degrees", () => {
    expect(TIME_AXIS_PROPS).toEqual({ angle: -35, textAnchor: "end", height: 50 });
  });

  it("all use the one shared setting, and none sets its own angle", () => {
    const axes = files(join(process.cwd(), "src")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<XAxis\b[\s\S]*?\/>/g)].map((m) => ({ f, axis: m[0] }))
    );
    expect(axes.length).toBeGreaterThan(5);
    for (const { f, axis } of axes) {
      expect(axis, f).toContain("{...TIME_AXIS_PROPS}");
      expect(axis, f).not.toMatch(/\bangle=/);
    }
  });
});
