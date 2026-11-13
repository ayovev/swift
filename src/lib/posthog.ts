import type { PostHog } from "posthog-js";
import type { CsvErrorCategory } from "./csv/parseCsv";
import type { SyncFailureReason } from "./sync/syncSession";

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

/** Which side of a sync pairing this device was — never anything more identifying. */
export type SyncRole = "host" | "joiner";

/**
 * Which control was used — a fixed vocabulary, never a value the athlete
 * entered or a number derived from their data. Add a name here and nowhere
 * else; the type is what keeps an interaction event from carrying content.
 */
export type InteractionName =
  | "entry_added"
  | "entry_edited"
  | "entry_deleted"
  | "timeline_range_changed"
  | "timeline_subject_opened"
  | "movement_selected"
  | "implement_selected"
  | "backup_exported"
  | "backup_imported"
  | "weigh_in_saved"
  | "weigh_in_deleted"
  | "weigh_in_delete_undone"
  | "stale_log_replace_clicked"
  | "stale_log_snoozed"
  // A chart point picked (the list below narrows to it), and a picked point followed to its workouts on another view. Never which
  // point, bucket, date, lift or count: only that it happened.
  | "chart_point_selected"
  | "chart_point_opened"
  // A stretch of a Training chart dragged to set the date range. Never the dates, the buckets or how many.
  | "chart_range_dragged"
  // Charts shown as tables, or back: only that the switch was used, not which way.
  | "chart_view_toggled";

type SwiftEvent =
  | { name: "app_opened"; props?: undefined }
  | { name: "upload_attempted"; props?: undefined }
  | { name: "upload_succeeded"; props: { rows: SizeBucket; duration_bucket: string } }
  | { name: "upload_failed"; props: { reason: CsvErrorCategory } }
  | { name: "sample_data_used"; props?: undefined }
  | { name: "sync_attempted"; props: { role: SyncRole } }
  | { name: "sync_succeeded"; props: { role: SyncRole; rows: SizeBucket } }
  | { name: "sync_failed"; props: { role: SyncRole; reason: SyncFailureReason } }
  | { name: "interaction_used"; props: { interaction: InteractionName } }
  | { name: "tab_viewed"; props: { tab: string; source: DataSource } }
  | { name: "theme_changed"; props: { mode?: string; accent?: string } }
  | {
      name: "date_range_changed";
      props: {
        preset:
          | "last_1_month"
          | "last_3_months"
          | "last_6_months"
          | "last_9_months"
          | "last_year"
          | "all_time"
          | "custom";
      };
    }
  | {
      name: "granularity_changed";
      props: { granularity: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" };
    };

const POSTHOG_HOST = "https://us.i.posthog.com";

let enabled = false;
let client: PostHog | null = null;
/** Events captured before the PostHog chunk has loaded, with when they happened. Drained once it has. */
let queue: { event: SwiftEvent; at: Date }[] = [];

/**
 * Run `fn` once the first screen has painted. PostHog is about a third of the app's JavaScript and nothing on screen
 * depends on it, so it loads after the page, not before it. `requestIdleCallback` is missing in Safari, hence the timer.
 */
function afterFirstPaint(fn: () => void): void {
  const run = () => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 200);
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}

/**
 * Initialise PostHog if a key is configured. With the placeholder empty key
 * (see .env.example) every capture below becomes a no-op, so the app runs
 * normally without analytics rather than erroring or blocking.
 *
 * The library itself is a separate chunk (`import("posthog-js")`) fetched after the first paint, from our own
 * origin like every other chunk. Events captured meanwhile are held in memory, with their time, and sent once it
 * is up; the privacy config below is unchanged by the delay. If the chunk cannot load, they are dropped: analytics is
 * never a requirement.
 */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  enabled = true;
  afterFirstPaint(() => {
    void import("posthog-js")
      .then(({ default: posthog }) => {
        startPostHog(posthog, key);
      })
      .catch(() => {
        enabled = false;
        queue = [];
      });
  });
}

function startPostHog(posthog: PostHog, key: string): void {
  posthog.init(key, {
    // Pinned, not configurable: vercel.json's connect-src allows exactly this host.
    api_host: POSTHOG_HOST,
    // No accounts, so never create a person profile.
    person_profiles: "never",
    // We send our own page view once, rather than on every SPA route change.
    capture_pageview: false,
    capture_pageleave: false,
    // Session recording would capture the athlete's workout data on screen —
    // exactly the workout content this must never capture.
    disable_session_recording: true,
    autocapture: false,
    // PostHog's project-level remote config can switch these on without a code
    // change here. Each would read the screen or error text (workout titles,
    // CSV parse messages), so pin them off in code rather than trusting the
    // dashboard setting.
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    disable_conversations: true,
    disable_web_experiments: true,
    advanced_disable_flags: true,
    persistence: "localStorage",
  });
  client = posthog;
  const held = queue;
  queue = [];
  for (const { event, at } of held) posthog.capture(event.name, event.props, { timestamp: at });
}

/** Capture one of the allowed events. No-op when analytics is not configured. */
export function capture(event: SwiftEvent): void {
  if (!enabled) return;
  if (!client) {
    queue.push({ event, at: new Date() });
    return;
  }
  client.capture(event.name, event.props);
}

/** Coarse timing bucket for the performance budget, not a precise measurement. */
export function bucketDuration(ms: number): string {
  if (ms < 500) return "under_500ms";
  if (ms < 1500) return "500ms_1.5s";
  if (ms < 5000) return "1.5s_5s";
  return "over_5s";
}
