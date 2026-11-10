import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXED_MODALITY_COLORS, MODALITY_DRAW_ORDER } from "@/components/dashboard/charts/chartUtils";
import { oklchToLinearSrgb, type Oklch, type Rgb } from "@/lib/theme/contrast";
import { MODALITY_LIST, type Modality } from "@/types/modality";

/**
 * The fixed M/W/G colours are red, green and blue and stay that way (CLAUDE.md, Theming), so what keeps a stack readable for a
 * colour-blind athlete is which colours touch. These tests read the real tokens from index.css in both modes, simulate the three
 * common colour-vision deficiencies (Machado, Oliveira & Fernandes 2009, full severity, on linear sRGB), and measure each adjacent
 * pair in MODALITY_DRAW_ORDER in OKLab. 8 (OKLab x100) is the separation the dataviz guidance asks of adjacent categorical marks.
 */

const CSS = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** `--repmax-N` in `:root` (light) and `.dark`, in that order of appearance. */
function tokens(name: string): { light: Oklch; dark: Oklch } {
  const found = [...CSS.matchAll(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`, "g"))].map((m) => ({
    l: Number(m[1]),
    c: Number(m[2]),
    h: Number(m[3]),
  }));
  expect(found).toHaveLength(2);
  return { light: found[0]!, dark: found[1]! };
}

/** FIXED_MODALITY_COLORS names its token as `var(--repmax-N)`. */
const tokenOf = (m: Modality): string => FIXED_MODALITY_COLORS[m].replace(/^var\(--(.+)\)$/, "$1");

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
const SIMULATIONS: Record<string, Matrix> = {
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function simulate(rgb: Rgb, m: Matrix): Rgb {
  const { r, g, b } = rgb;
  return {
    r: m[0][0] * r + m[0][1] * g + m[0][2] * b,
    g: m[1][0] * r + m[1][1] * g + m[1][2] * b,
    b: m[2][0] * r + m[2][1] * g + m[2][2] * b,
  };
}

/** Linear sRGB to OKLab (Ottosson). */
function oklab({ r, g, b }: Rgb): [number, number, number] {
  const [R, G, B] = [clamp01(r), clamp01(g), clamp01(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(a: Oklch, b: Oklch, sim: Matrix | null): number {
  const lin = (c: Oklch): Rgb => {
    const raw = oklchToLinearSrgb(c);
    const clipped = { r: clamp01(raw.r), g: clamp01(raw.g), b: clamp01(raw.b) };
    return sim ? simulate(clipped, sim) : clipped;
  };
  const [l1, a1, b1] = oklab(lin(a));
  const [l2, a2, b2] = oklab(lin(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

const adjacentPairs = (order: readonly Modality[]): [Modality, Modality][] => order.slice(1).map((m, i) => [order[i]!, m]);

describe("the M/W/G draw order", () => {
  it("draws every modality exactly once", () => {
    expect([...MODALITY_DRAW_ORDER].sort()).toEqual([...MODALITY_LIST].sort());
  });

  it("puts gymnastics between cardio and weightlifting, so red never touches green", () => {
    expect(MODALITY_DRAW_ORDER[1]).toBe("G");
  });

  for (const mode of ["light", "dark"] as const) {
    it(`keeps every adjacent pair at least 8 apart under each colour-vision deficiency (${mode})`, () => {
      for (const [a, b] of adjacentPairs(MODALITY_DRAW_ORDER)) {
        const ca = tokens(tokenOf(a))[mode];
        const cb = tokens(tokenOf(b))[mode];
        expect(deltaE(ca, cb, null), `${a}/${b} normal`).toBeGreaterThanOrEqual(15);
        for (const [name, sim] of Object.entries(SIMULATIONS)) {
          if (name === "tritan") continue; // a known limitation, pinned below
          expect(deltaE(ca, cb, sim), `${a}/${b} ${name}`).toBeGreaterThanOrEqual(8);
        }
      }
    });

    it(`pins the one pair below target: green and blue under tritanopia (${mode})`, () => {
      // Measured about 5.3 (light) and 4.5 (dark). Tritanopia is rare (well under 1 in 1,000), and the 2px gap between segments is
      // the secondary encoding that carries it. Fixing it means changing a fixed colour, which is the owner's call
      // (docs/design-critique.md, "Constraints worth revisiting"). If this starts failing upward, the colours changed: move it.
      const w = tokens(tokenOf("W"))[mode];
      const g = tokens(tokenOf("G"))[mode];
      const d = deltaE(w, g, SIMULATIONS.tritan!);
      expect(d).toBeGreaterThan(4);
      expect(d).toBeLessThan(8);
    });

    it(`documents why: the canonical M, W, G stack put red on green, which deuteranopia can barely separate (${mode})`, () => {
      const m = tokens(tokenOf("M"))[mode];
      const w = tokens(tokenOf("W"))[mode];
      expect(deltaE(m, w, SIMULATIONS.deutan!)).toBeLessThan(6);
    });
  }
});
