import { afterEach, describe, expect, it } from "vitest";
import { chartColorVar } from "@/components/ui/chart";
import { DOMAIN_CHART_CONFIG } from "@/components/dashboard/charts/chartUtils";
import { DOMAIN_LIST } from "@/types/dashboard";

describe("chartColorVar", () => {
  it("leaves a plain identifier-safe key unchanged", () => {
    expect(chartColorVar("Strength")).toBe("--color-Strength");
  });

  it("escapes a key with characters CSS identifiers can't hold unescaped", () => {
    // Regression case: this exact GPP domain name broke ChartStyle's
    // generated <style> tag — jsdom (and, per spec, any CSS parser) reads
    // "--color-Cardiovascular/Respiratory Endurance:" as a syntax error,
    // since the unescaped "/" and space end the identifier early.
    const escaped = chartColorVar("Cardiovascular/Respiratory Endurance");
    expect(escaped).toBe(`--color-${CSS.escape("Cardiovascular/Respiratory Endurance")}`);
    expect(escaped).toBe("--color-Cardiovascular\\/Respiratory\\ Endurance");
  });
});

describe("ChartStyle's generated custom properties parse for every real ChartConfig", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("produces one valid CSS rule per domain, for every GPP domain name", () => {
    // Mirrors exactly what ChartStyle (chart.tsx) builds, without needing to
    // mount a full ChartContainer/ResponsiveContainer in jsdom.
    const declarations = Object.entries(DOMAIN_CHART_CONFIG)
      .map(([key, config]) => `  ${chartColorVar(key)}: ${config.color};`)
      .join("\n");
    const style = document.createElement("style");
    style.textContent = ` [data-chart=test] {\n${declarations}\n}\n`;
    document.head.appendChild(style);

    expect(style.sheet).not.toBeNull();
    expect(style.sheet!.cssRules).toHaveLength(1);
    const rule = style.sheet!.cssRules[0] as CSSStyleRule;
    // Every domain's custom property actually made it into the parsed rule —
    // if escaping were wrong, the whole declaration block would be dropped
    // rather than just one property, since a stray "/" or space breaks the
    // parser's ability to find the rest of the block at all.
    expect(rule.style.length).toBe(DOMAIN_LIST.length);
  });
});
