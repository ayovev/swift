import { useSyncExternalStore } from "react";
import { isHexColor, MAX_PALETTE } from "./color";
import { MAX_STORED_CHARS, type LogoTone } from "./image";

/**
 * The coach's brand: a logo, a gym name and a colour, each optional.
 *
 * A per-device preference like the theme and the audience, so it lives in
 * `localStorage` (try/catch, in memory when storage throws) and never in the
 * IndexedDB cache that "Start over" wipes: a coach moves from one athlete to
 * the next and should not re-enter it each time. It is not a `SyncDataset`, so
 * it never syncs and never travels in a backup (CLAUDE.md: preferences do not).
 * Nothing here is sent anywhere, and nothing here may reach analytics.
 */
export interface Brand {
  /** A normalised PNG/JPEG/WebP data URL (see image.ts). */
  logo?: string;
  tone?: LogoTone;
  /** Up to three colours found in the logo (see `dominantColors`), offered as suggestions. `[]` means the logo has none; absent means not looked for. */
  palette?: string[];
  /** Plain text; also the logo's alt text. */
  name?: string;
  /** "#rrggbb". */
  color?: string;
}

export const BRAND_STORAGE_KEY = "swift.brand";
export const MAX_NAME_LENGTH = 60;

const LOGO_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Whatever is stored, reduced to the fields that are valid. Junk in storage never breaks the app. */
export function parseBrand(raw: string | null): Brand {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null) return {};
  const v = value as Record<string, unknown>;
  const brand: Brand = {};
  if (typeof v.logo === "string" && v.logo.length <= MAX_STORED_CHARS && LOGO_URL.test(v.logo)) {
    brand.logo = v.logo;
    const t = v.tone as Record<string, unknown> | undefined;
    if (t && typeof t.luminance === "number" && typeof t.transparent === "boolean") {
      brand.tone = { luminance: Math.min(1, Math.max(0, t.luminance)), transparent: t.transparent };
    }
    if (Array.isArray(v.palette)) {
      brand.palette = v.palette.filter(isHexColor).map((c) => c.toLowerCase()).slice(0, MAX_PALETTE);
    }
  }
  if (typeof v.name === "string" && v.name.trim() !== "") brand.name = v.name.trim().slice(0, MAX_NAME_LENGTH);
  if (isHexColor(v.color)) brand.color = v.color.toLowerCase();
  return brand;
}

let memoryRaw: string | null = null;
let cached: { raw: string | null; brand: Brand } = { raw: null, brand: {} };
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(BRAND_STORAGE_KEY) ?? memoryRaw;
  } catch {
    return memoryRaw;
  }
}

export function getBrand(): Brand {
  const raw = readRaw();
  if (raw !== cached.raw) cached = { raw, brand: parseBrand(raw) };
  return cached.brand;
}

function writeBrand(brand: Brand): void {
  const empty = Object.keys(brand).length === 0;
  const raw = empty ? null : JSON.stringify(brand);
  memoryRaw = raw;
  try {
    if (raw === null) localStorage.removeItem(BRAND_STORAGE_KEY);
    else localStorage.setItem(BRAND_STORAGE_KEY, raw);
  } catch {
    /* non-fatal: kept in memory for this tab */
  }
  listeners.forEach((l) => l());
}

/** Merge fields in; `undefined` removes one. */
export function updateBrand(patch: { [K in keyof Brand]?: Brand[K] | undefined }): void {
  const next: Brand = { ...getBrand() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key as keyof Brand];
    else (next as Record<string, unknown>)[key] = value;
  }
  if (!next.logo) {
    delete next.tone;
    delete next.palette;
  }
  writeBrand(parseBrand(JSON.stringify(next)));
}

export function clearBrand(): void {
  writeBrand({});
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent): void => {
    if (e.key === BRAND_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The one way components read the brand. A future report feature reads it here too. */
export function useBrand(): Brand {
  return useSyncExternalStore(subscribe, getBrand, getBrand);
}
