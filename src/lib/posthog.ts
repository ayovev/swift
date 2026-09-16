import posthog from "posthog-js";
import type { CsvErrorCategory } from "./csv/parseCsv";

/**
 * Anonymous product analytics.
 *
 * THE RULE: usage and failure signals only. No workout content, no filenames,
 * no derived training data, no identifiers of any kind. Swift has no accounts,
 * so there is nothing to identify anyone with — and we never call identify().
 *
 * The event payloads below are the ENTIRE surface. Every property is either a
 * fixed string from a closed vocabulary or a coarse bucket. Adding anything
 * derived from a member's CSV here would break the privacy guarantee the whole
 * product rests on, so the types are deliberately narrow rather than
 * `Record<string, unknown>`.
 */

type DataSource = "upload" | "sample";

/** Coarse size buckets — never an exact row count, which is closer to a fingerprint. */
export type SizeBucket = "under_100" | "100_500" | "500_1500" | "over_1500";

export function bucketRowCount(rows: number): SizeBucket {
  if (rows < 100) return "under_100";
  if (rows < 500) return "100_500";
  if (rows <= 1500) return "500_1500";
  return "over_1500";
}

type SwiftEvent =
  | { name: "app_opened"; props?: undefined }
  | { name: "upload_attempted"; props?: undefined }
  | { name: "upload_succeeded"; props: { rows: SizeBucket; duration_bucket: string } }
  | { name: "upload_failed"; props: { reason: CsvErrorCategory } }
  | { name: "sample_data_used"; props?: undefined }
  | { name: "tab_viewed"; props: { tab: string; source: DataSource } }
  | { name: "theme_changed"; props: { mode?: string; accent?: string } };

let enabled = false;

/**
 * Initialise PostHog if a key is configured. With the placeholder empty key
 * (see .env.example) every capture below becomes a no-op, so the app runs
 * normally without analytics rather than erroring or blocking.
 */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // No accounts, so never create a person profile.
    person_profiles: "never",
    // We send our own page view once, rather than on every SPA route change.
    capture_pageview: false,
    capture_pageleave: false,
    // Session recording would capture the athlete's workout data on screen —
    // exactly the workout content this must never capture.
    disable_session_recording: true,
    autocapture: false,
    persistence: "localStorage",
  });
  enabled = true;
}

/** Capture one of the allowed events. No-op when analytics is not configured. */
export function capture(event: SwiftEvent): void {
  if (!enabled) return;
  posthog.capture(event.name, event.props);
}

/** Coarse timing bucket for the performance budget, not a precise measurement. */
export function bucketDuration(ms: number): string {
  if (ms < 500) return "under_500ms";
  if (ms < 1500) return "500ms_1.5s";
  if (ms < 5000) return "1.5s_5s";
  return "over_5s";
}
