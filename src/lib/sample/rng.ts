/**
 * A small deterministic-per-key PRNG kit shared by every generator in
 * `src/lib/sample/` (see `extendSample.ts`'s header comment for the full
 * reasoning). Seeding off a stable string key — a date plus a purpose —
 * rather than off "now" means reloading demo mode never reshuffles data
 * already generated for a given day; only the newest tick can change.
 */

/** FNV-1a string hash — good enough spread for a display-only PRNG seed. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, decent-quality PRNG; no crypto properties needed here. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh PRNG for one (key, purpose) pair, so independent draws don't correlate. */
export function rngFor(key: string, purpose: string): () => number {
  return mulberry32(hashSeed(`${key}:${purpose}`));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
