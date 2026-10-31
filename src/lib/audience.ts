/**
 * Which side of the landing splash the visitor picked. A per-device
 * preference like the theme, so it lives in `localStorage` (read synchronously,
 * before first render, so a returning visitor never sees the splash flash up)
 * and, like every preference, never syncs or travels in a backup.
 */
export type Audience = "athlete" | "coach";

const STORAGE_KEY = "swift.audience";

export function readAudience(): Audience | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "athlete" || raw === "coach" ? raw : null;
  } catch {
    // Private browsing or blocked storage: the splash just shows again.
    return null;
  }
}

export function writeAudience(audience: Audience): void {
  try {
    localStorage.setItem(STORAGE_KEY, audience);
  } catch {
    /* non-fatal */
  }
}
