import { afterEach, describe, expect, it } from "vitest";
import {
  BRAND_STORAGE_KEY,
  MAX_NAME_LENGTH,
  clearBrand,
  getBrand,
  parseBrand,
  updateBrand,
} from "@/lib/brand/brandStore";
import { MAX_PALETTE, brandSwatch, dominantColors, hexToOklch, isHexColor, oklabDistance, oklchToHex, rgbToOklch, swatchProblems } from "@/lib/brand/color";
import { fitWithin, measureTone, plateFor, sniffImageType } from "@/lib/brand/image";
import { ACCENT_SWATCHES, accentRoles } from "@/lib/theme/palette";

afterEach(() => {
  clearBrand();
  localStorage.clear();
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("logo files", () => {
  it("recognises PNG, JPEG and WebP by their first bytes, and nothing else", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });

  it("scales the long edge down to the limit and never up", () => {
    expect(fitWithin(2048, 1024, 512)).toEqual({ width: 512, height: 256 });
    expect(fitWithin(300, 900, 512)).toEqual({ width: 171, height: 512 });
    expect(fitWithin(100, 50, 512)).toEqual({ width: 100, height: 50 });
    expect(fitWithin(10_000, 1, 512).height).toBe(1);
  });

  it("measures the visible pixels, weighted by opacity", () => {
    const white = [255, 255, 255, 255];
    const clear = [0, 0, 0, 0];
    expect(measureTone([...white, ...white])).toEqual({ luminance: expect.closeTo(1, 5), transparent: false });
    const mixed = measureTone([...white, ...clear]);
    expect(mixed.transparent).toBe(true);
    expect(mixed.luminance).toBeCloseTo(1, 5);
    expect(measureTone([0, 0, 0, 255]).luminance).toBe(0);
    expect(measureTone([]).transparent).toBe(false);
  });

  it("puts a plate behind a see-through logo only where the page would swallow it", () => {
    expect(plateFor({ luminance: 0.95, transparent: true }, "light")).toBe("dark");
    expect(plateFor({ luminance: 0.02, transparent: true }, "dark")).toBe("light");
    expect(plateFor({ luminance: 0.95, transparent: true }, "dark")).toBeNull();
    expect(plateFor({ luminance: 0.02, transparent: true }, "light")).toBeNull();
    // An opaque logo brings its own background.
    expect(plateFor({ luminance: 0.95, transparent: false }, "light")).toBeNull();
    expect(plateFor(undefined, "light")).toBeNull();
  });
});

describe("brand colour", () => {
  it("reads hex into OKLCH", () => {
    expect(hexToOklch("#ffffff")?.l).toBeCloseTo(1, 2);
    expect(hexToOklch("#000000")?.l).toBeCloseTo(0, 3);
    expect(hexToOklch("#ff0000")?.h).toBeCloseTo(29.2, 0);
    expect(hexToOklch("red")).toBeNull();
    expect(isHexColor("#12abEF")).toBe(true);
    expect(isHexColor("#12abE")).toBe(false);
  });

  it("holds every colour to the same contrast rules as the stock swatches, in both modes", () => {
    const samples = ["#2563eb", "#ff0000", "#dc2626", "#ffff00", "#00ff00", "#ffffff", "#000000", "#808080", "#7c3aed", "#f97316", "#14b8a6", "#ec4899", "#fef08a", "#1e3a8a"];
    for (const hex of samples) {
      const result = brandSwatch(hex);
      expect(result, hex).not.toBeNull();
      expect(swatchProblems(result!.swatch), hex).toEqual([]);
    }
  });

  it("keeps a red brand colour away from the destructive red", () => {
    const { swatch, adjusted } = brandSwatch("#ff0000")!;
    expect(adjusted).toBe(true);
    for (const mode of ["light", "dark"] as const) {
      const destructive = mode === "light" ? { l: 0.577, c: 0.245, h: 27.325 } : { l: 0.704, c: 0.191, h: 22.216 };
      expect(oklabDistance(accentRoles(swatch, mode).primary, destructive)).toBeGreaterThanOrEqual(8);
    }
  });

  it("leaves a colour that already passes alone", () => {
    const { swatch, adjusted } = brandSwatch("#2563eb")!;
    expect(adjusted).toBe(false);
    expect(swatch.hue).toBeCloseTo(hexToOklch("#2563eb")!.h, 5);
  });

  it("rejects what is not a hex colour", () => {
    expect(brandSwatch("blue")).toBeNull();
    expect(brandSwatch("")).toBeNull();
  });

  it("the stock swatches pass the same check, apart from the known red overlap", () => {
    const failing = ACCENT_SWATCHES.filter((s) => swatchProblems(s).length > 0).map((s) => s.id);
    expect(failing).toEqual(["red"]);
  });
});

describe("brand storage", () => {
  it("round-trips and persists in localStorage under its own key", () => {
    updateBrand({ name: "  Iron Works ", color: "#2563EB", logo: PNG, tone: { luminance: 0.4, transparent: true } });
    expect(getBrand()).toEqual({ name: "Iron Works", color: "#2563eb", logo: PNG, tone: { luminance: 0.4, transparent: true } });
    expect(localStorage.getItem(BRAND_STORAGE_KEY)).not.toBeNull();
  });

  it("removes a field when it is set to undefined, and a logo takes its tone with it", () => {
    updateBrand({ name: "Gym", logo: PNG, tone: { luminance: 0.4, transparent: false } });
    updateBrand({ logo: undefined });
    expect(getBrand()).toEqual({ name: "Gym" });
  });

  it("clears to nothing and removes the key", () => {
    updateBrand({ name: "Gym" });
    clearBrand();
    expect(getBrand()).toEqual({});
    expect(localStorage.getItem(BRAND_STORAGE_KEY)).toBeNull();
  });

  it("ignores junk: bad JSON, a non-image data URL, an SVG, a bad colour, an over-long name", () => {
    expect(parseBrand("{nope")).toEqual({});
    expect(parseBrand("42")).toEqual({});
    expect(parseBrand(JSON.stringify({ logo: "https://example.com/logo.png" }))).toEqual({});
    expect(parseBrand(JSON.stringify({ logo: "data:image/svg+xml;base64,PHN2Zy8+" }))).toEqual({});
    expect(parseBrand(JSON.stringify({ logo: "data:image/png;base64,AAAA\"onerror=\"x" }))).toEqual({});
    expect(parseBrand(JSON.stringify({ color: "blue", name: "x".repeat(200) })).name).toHaveLength(MAX_NAME_LENGTH);
    expect(parseBrand(JSON.stringify({ color: "blue" })).color).toBeUndefined();
  });

  it("is not part of anything that syncs or backs up", async () => {
    const { Reassembler } = await import("@/lib/sync/chunking");
    // The wire accepts exactly four dataset names, and "brand" is not one of them.
    const bad = new TextEncoder().encode(JSON.stringify({ dataset: "brand", byteLength: 0, chunkCount: 0 }));
    expect(() => new Reassembler().feed(bad)).toThrow(/unknown dataset/);
  });
});

/** "#rrggbb" as [r, g, b]. */
function rgbOfHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** RGBA bytes for `count` identical pixels. */
function pixels(r: number, g: number, b: number, a: number, count: number): number[] {
  return Array.from({ length: count }, () => [r, g, b, a]).flat();
}

describe("colours in a logo", () => {
  const hueOf = (hex: string): number => hexToOklch(hex)!.h;
  const near = (a: number, b: number, within: number): boolean => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) <= within;

  it("converts between RGB, hex and OKLCH both ways", () => {
    expect(rgbToOklch(255, 255, 255).l).toBeCloseTo(1, 2);
    expect(rgbToOklch(0, 0, 0).c).toBeCloseTo(0, 5);
    for (const hex of ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed"]) {
      expect(oklchToHex(hexToOklch(hex)!), hex).toBe(hex);
    }
  });

  it("finds the colours of a two-colour logo, the larger area first", () => {
    const logo = [...pixels(220, 38, 38, 255, 300), ...pixels(37, 99, 235, 255, 100), ...pixels(255, 255, 255, 255, 600)];
    const found = dominantColors(logo);
    expect(found).toHaveLength(2);
    expect(near(hueOf(found[0]!), hueOf("#dc2626"), 6)).toBe(true);
    expect(near(hueOf(found[1]!), hueOf("#2563eb"), 6)).toBe(true);
  });

  it("lets a small vivid mark outweigh a larger, paler area of another colour", () => {
    // Both are real colours (above the grey floor). The tint covers more than twice the area, but the blue carries more chroma in total,
    // so counting pixels alone would pick the tint.
    const tint = rgbOfHex(oklchToHex({ l: 0.9, c: 0.05, h: 25 }));
    expect(rgbToOklch(...tint).c).toBeGreaterThan(0.04);
    const logo = [...pixels(...tint, 255, 400), ...pixels(37, 99, 235, 255, 150)];
    const found = dominantColors(logo);
    expect(found).toHaveLength(2);
    expect(near(hueOf(found[0]!), hueOf("#2563eb"), 6)).toBe(true);
  });

  it("returns nothing for a black, white or grey logo", () => {
    expect(dominantColors([...pixels(0, 0, 0, 255, 300), ...pixels(255, 255, 255, 255, 300), ...pixels(128, 128, 128, 255, 300)])).toEqual([]);
  });

  it("ignores see-through and anti-aliased edge pixels", () => {
    // A blue logo whose edges are half-transparent red: only the solid blue counts.
    const logo = [...pixels(37, 99, 235, 255, 200), ...pixels(220, 38, 38, 128, 400), ...pixels(220, 38, 38, 0, 400)];
    const found = dominantColors(logo);
    expect(found).toHaveLength(1);
    expect(near(hueOf(found[0]!), hueOf("#2563eb"), 6)).toBe(true);
  });

  it("returns nothing when only a few stray pixels are coloured", () => {
    expect(dominantColors([...pixels(255, 255, 255, 255, 1000), ...pixels(37, 99, 235, 255, 2)])).toEqual([]);
  });

  it("averages a colour that straddles a hue bucket edge, and one that wraps around red, into one colour", () => {
    // 13 and 17 degrees fall in neighbouring 15-degree buckets; 358 and 2 fall either side of the wrap. Each pair is one colour, at the middle.
    const straddle = [...pixels(...rgbOfHex(oklchToHex({ l: 0.6, c: 0.15, h: 13 })), 255, 200), ...pixels(...rgbOfHex(oklchToHex({ l: 0.6, c: 0.15, h: 17 })), 255, 200)];
    const one = dominantColors(straddle);
    expect(one).toHaveLength(1);
    expect(near(hueOf(one[0]!), 15, 1.5)).toBe(true);
    const wrap = [...pixels(...rgbOfHex(oklchToHex({ l: 0.6, c: 0.15, h: 358 })), 255, 200), ...pixels(...rgbOfHex(oklchToHex({ l: 0.6, c: 0.15, h: 2 })), 255, 200)];
    const two = dominantColors(wrap);
    expect(two).toHaveLength(1);
    expect(near(hueOf(two[0]!), 0, 1.5)).toBe(true);
  });

  it("offers at most three, and a colour of negligible share is left out", () => {
    const four = [
      ...pixels(220, 38, 38, 255, 400),
      ...pixels(37, 99, 235, 255, 300),
      ...pixels(22, 163, 74, 255, 200),
      ...pixels(245, 158, 11, 255, 100),
    ];
    const found = dominantColors(four);
    expect(found).toHaveLength(MAX_PALETTE);
    expect(new Set(found).size).toBe(MAX_PALETTE);
    // The fourth colour is the one dropped, and a trace of a second colour does not make a second candidate.
    const trace = [...pixels(220, 38, 38, 255, 1000), ...pixels(37, 99, 235, 255, 20)];
    expect(dominantColors(trace)).toHaveLength(1);
  });

  it("is deterministic and tolerates empty input", () => {
    const logo = [...pixels(220, 38, 38, 255, 300), ...pixels(37, 99, 235, 255, 100)];
    expect(dominantColors(logo)).toEqual(dominantColors(logo));
    expect(dominantColors([])).toEqual([]);
  });

  it("feeds a found colour straight into the brand-colour check", () => {
    for (const hex of dominantColors([...pixels(220, 38, 38, 255, 300), ...pixels(245, 158, 11, 255, 200), ...pixels(22, 163, 74, 255, 100)])) {
      const result = brandSwatch(hex);
      expect(result, hex).not.toBeNull();
      expect(swatchProblems(result!.swatch), hex).toEqual([]);
    }
  });
});

describe("the stored palette", () => {
  it("round-trips, lowercases, keeps at most three valid colours and drops junk", () => {
    updateBrand({ logo: PNG, tone: { luminance: 0.4, transparent: false }, palette: ["#2563EB", "#dc2626"] });
    expect(getBrand().palette).toEqual(["#2563eb", "#dc2626"]);
    expect(parseBrand(JSON.stringify({ logo: PNG, palette: ["#111111", "red", 5, "#222222", "#333333", "#444444"] })).palette).toEqual(["#111111", "#222222", "#333333"]);
  });

  it("keeps an empty palette (a logo with no colour), but not one without a logo", () => {
    expect(parseBrand(JSON.stringify({ logo: PNG, palette: [] })).palette).toEqual([]);
    expect(parseBrand(JSON.stringify({ palette: ["#111111"] })).palette).toBeUndefined();
  });

  it("goes when the logo does", () => {
    updateBrand({ logo: PNG, palette: ["#2563eb"], name: "Gym" });
    updateBrand({ logo: undefined });
    expect(getBrand()).toEqual({ name: "Gym" });
  });
});
