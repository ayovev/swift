/**
 * Colour maths for the theming system, and its accessibility guarantees.
 *
 * The accent colour is user-selectable, so "does this have enough contrast?"
 * cannot be settled by eye at design time — it has to hold for every swatch in
 * both light and dark mode. These are pure functions so themeContrast.test.ts
 * can assert exactly that.
 *
 * Colours are authored in OKLCH, which is perceptually uniform: stepping
 * lightness produces an evenly-spaced ramp, which sRGB HSL does not.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  l: number;
  /** Chroma (saturation), 0–~0.37 in practice. */
  c: number;
  /** Hue angle in degrees, 0–360. */
  h: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Gamma-encode one linear-light channel to sRGB. */
function encodeGamma(channel: number): number {
  const v = clamp01(channel);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** Linear-light sRGB components, before gamma encoding. */
function oklchToLinearSrgb(color: Oklch): Rgb {
  const hRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hRad);
  const b = color.c * Math.sin(hRad);

  const lCone = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: 4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    g: -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    b: -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  };
}

/** OKLCH to 0–255 sRGB, clipped to gamut. */
export function oklchToRgb(color: Oklch): Rgb {
  const linear = oklchToLinearSrgb(color);
  return {
    r: Math.round(encodeGamma(linear.r) * 255),
    g: Math.round(encodeGamma(linear.g) * 255),
    b: Math.round(encodeGamma(linear.b) * 255),
  };
}

/** True when the colour falls outside the sRGB gamut and had to be clipped. */
export function isOutOfGamut(color: Oklch): boolean {
  const { r, g, b } = oklchToLinearSrgb(color);
  const slack = 1e-4;
  return [r, g, b].some((v) => v < -slack || v > 1 + slack);
}

/**
 * Reduce chroma until the colour fits in sRGB, keeping lightness and hue.
 *
 * Needed because the gamut is not a box: a very light blue (high L, hue ~256)
 * leaves sRGB at a chroma a mid-tone of the same hue handles easily. Rather
 * than hand-tuning per-swatch constants until nothing clips — which breaks the
 * moment a swatch is added — every derived colour goes through this.
 *
 * Binary search on chroma; lightness and hue are preserved exactly, so the
 * ramp stays perceptually even.
 */
export function clampToGamut(color: Oklch): Oklch {
  if (!isOutOfGamut(color)) return color;

  let low = 0;
  let high = color.c;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (isOutOfGamut({ ...color, c: mid })) high = mid;
    else low = mid;
  }
  return { ...color, c: low };
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(color: Oklch): number {
  const { r, g, b } = oklchToLinearSrgb(color);
  const lin = (v: number): number => clamp01(v);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio between two colours, 1–21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export const BLACK: Oklch = { l: 0, c: 0, h: 0 };
export const WHITE: Oklch = { l: 1, c: 0, h: 0 };

/**
 * Pick the readable foreground for a filled surface — used for text on an
 * accent-coloured button, where a fixed white would fail on a light swatch
 * (yellow) and a fixed black would fail on a dark one.
 */
export function pickForeground(background: Oklch): "black" | "white" {
  return contrastRatio(background, WHITE) >= contrastRatio(background, BLACK)
    ? "white"
    : "black";
}

/** Serialise for CSS. */
export function formatOklch({ l, c, h }: Oklch): string {
  const round = (n: number, places: number): number =>
    Math.round(n * 10 ** places) / 10 ** places;
  return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)})`;
}

/** WCAG minimums. */
export const CONTRAST_TEXT = 4.5;
export const CONTRAST_LARGE_TEXT = 3;
export const CONTRAST_UI = 3;
