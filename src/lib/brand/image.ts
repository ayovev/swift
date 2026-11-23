import { dominantColors } from "./color";

/**
 * Turning a chosen file into the one small, safe image Swift keeps as a logo.
 *
 * The file is decoded and drawn onto a canvas, then written back out, so
 * whatever was in it other than pixels (EXIF, including GPS, a color profile,
 * trailing data) is gone. SVG is refused on purpose: it can carry script, and a
 * raster is enough for a logo. The pure parts (type sniffing, sizing, tone) are
 * here for tests; `normalizeLogo` needs a real browser canvas.
 */

export type LogoType = "image/png" | "image/jpeg" | "image/webp";

export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_EDGE = 512;
/** The stored data URL is held under this, in characters, so localStorage stays small. */
export const MAX_STORED_CHARS = 150_000;

export type LogoErrorReason = "not_an_image" | "too_large" | "unreadable";

export class LogoError extends Error {
  readonly reason: LogoErrorReason;
  constructor(reason: LogoErrorReason) {
    super(logoErrorMessage(reason));
    this.reason = reason;
  }
}

export function logoErrorMessage(reason: LogoErrorReason): string {
  switch (reason) {
    case "not_an_image":
      return "That file isn't a PNG, JPEG or WebP image.";
    case "too_large":
      return "That image is over 5 MB. Choose a smaller one.";
    case "unreadable":
      return "That image couldn't be read. Try exporting it again.";
  }
}

/** The format by the file's first bytes, not its name or declared type. */
export function sniffImageType(bytes: Uint8Array): LogoType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Scale so the long edge is at most `max`, never up. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** What the logo's visible pixels look like, measured once at upload. */
export interface LogoTone {
  /** Mean relative luminance of the visible pixels, 0 to 1, weighted by opacity. */
  luminance: number;
  /** True when a real share of the image is see-through, so the page shows through it. */
  transparent: boolean;
}

/** From RGBA bytes (a canvas `getImageData().data`). */
export function measureTone(rgba: ArrayLike<number>): LogoTone {
  let weighted = 0;
  let weight = 0;
  let clear = 0;
  const pixels = Math.floor(rgba.length / 4);
  for (let i = 0; i < pixels; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    if (a < 0.98) clear++;
    if (a === 0) continue;
    const lin = (v: number): number => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const y = 0.2126 * lin(rgba[i * 4]!) + 0.7152 * lin(rgba[i * 4 + 1]!) + 0.0722 * lin(rgba[i * 4 + 2]!);
    weighted += y * a;
    weight += a;
  }
  return {
    luminance: weight === 0 ? 0.5 : weighted / weight,
    transparent: pixels > 0 && clear / pixels > 0.05,
  };
}

/** Plate colors; fixed on purpose, since the plate exists to be the opposite of the logo, not of the theme. */
export type Plate = "light" | "dark";

/** A plate only where the page would swallow the logo: a see-through light logo in light mode, a dark one in dark mode. */
export function plateFor(tone: LogoTone | undefined, mode: "light" | "dark"): Plate | null {
  if (!tone || !tone.transparent) return null;
  if (mode === "light" && tone.luminance > 0.7) return "dark";
  if (mode === "dark" && tone.luminance < 0.1) return "light";
  return null;
}

export interface NormalizedLogo {
  dataUrl: string;
  tone: LogoTone;
  /** Up to three colors found in the logo, most prominent first; empty when it has none (a black and white logo). */
  palette: string[];
}

/** Decode, redraw and re-encode. Throws `LogoError`. */
export async function normalizeLogo(file: File): Promise<NormalizedLogo> {
  if (file.size > MAX_INPUT_BYTES) throw new LogoError("too_large");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImageType(head)) throw new LogoError("not_an_image");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new LogoError("unreadable");
  }

  try {
    for (const edge of [MAX_EDGE, 256, 128]) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new LogoError("unreadable");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const tone = measureTone(pixels);
      const palette = dominantColors(pixels);
      // WebP where the browser can write it; PNG otherwise (a browser that can't ignores the request and returns PNG).
      const dataUrl = canvas.toDataURL("image/webp", 0.9);
      if (dataUrl.length <= MAX_STORED_CHARS) return { dataUrl, tone, palette };
    }
    throw new LogoError("too_large");
  } finally {
    bitmap.close();
  }
}
