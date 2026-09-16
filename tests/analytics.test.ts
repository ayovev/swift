import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import { loadSampleCsvText } from "./fixtures/sampleRows";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), capture: vi.fn(), identify: vi.fn() },
}));

const mocked = vi.mocked(posthog);

/** Re-import with a given env so initAnalytics() sees the right key. */
async function loadAnalytics(key: string) {
  vi.resetModules();
  vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", key);
  vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://example.invalid");
  return import("@/lib/posthog");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analytics — disabled without a key (the shipped default)", () => {
  it("never initialises PostHog when the key is empty", async () => {
    const { initAnalytics } = await loadAnalytics("");
    initAnalytics();
    expect(mocked.init).not.toHaveBeenCalled();
  });

  it("makes every capture a no-op, so the app runs normally", async () => {
    const { initAnalytics, capture } = await loadAnalytics("");
    initAnalytics();
    capture({ name: "app_opened" });
    capture({ name: "sample_data_used" });
    expect(mocked.capture).not.toHaveBeenCalled();
  });
});

describe("analytics — privacy-preserving configuration", () => {
  it("disables person profiles, session recording and autocapture", async () => {
    const { initAnalytics } = await loadAnalytics("phc_test");
    initAnalytics();
    expect(mocked.init).toHaveBeenCalledOnce();
    const [key, config] = mocked.init.mock.calls[0]!;
    expect(key).toBe("phc_test");
    // Session recording would capture the athlete's workouts on screen, and
    // autocapture would send the text of whatever they clicked.
    expect(config).toMatchObject({
      person_profiles: "never",
      disable_session_recording: true,
      autocapture: false,
      capture_pageview: false,
    });
  });

  it("never identifies anyone — v1 has no accounts to identify", async () => {
    const { initAnalytics, capture } = await loadAnalytics("phc_test");
    initAnalytics();
    capture({ name: "app_opened" });
    capture({ name: "upload_attempted" });
    expect(mocked.identify).not.toHaveBeenCalled();
  });
});

describe("analytics — event payloads carry no workout content", () => {
  it("sends the key lifecycle events named in the acceptance criteria", async () => {
    const { initAnalytics, capture, bucketRowCount, bucketDuration } =
      await loadAnalytics("phc_test");
    initAnalytics();

    capture({ name: "app_opened" });
    capture({ name: "upload_attempted" });
    capture({
      name: "upload_succeeded",
      props: { rows: bucketRowCount(1209), duration_bucket: bucketDuration(50) },
    });
    capture({ name: "upload_failed", props: { reason: "missing_columns" } });
    capture({ name: "sample_data_used" });

    expect(mocked.capture.mock.calls.map((c) => c[0])).toEqual([
      "app_opened",
      "upload_attempted",
      "upload_succeeded",
      "upload_failed",
      "sample_data_used",
    ]);
  });

  it("buckets row counts instead of sending an exact, fingerprintable total", async () => {
    const { bucketRowCount } = await loadAnalytics("phc_test");
    expect(bucketRowCount(42)).toBe("under_100");
    expect(bucketRowCount(1209)).toBe("500_1500");
    expect(bucketRowCount(99999)).toBe("over_1500");
    // The real sample has 1,209 rows; the event must not say so.
    expect(JSON.stringify(bucketRowCount(1209))).not.toContain("1209");
  });

  it("sends only a closed-vocabulary failure reason, never file content", async () => {
    const { initAnalytics, capture } = await loadAnalytics("phc_test");
    initAnalytics();
    capture({ name: "upload_failed", props: { reason: "malformed" } });
    const [, props] = mocked.capture.mock.calls[0]!;
    expect(props).toEqual({ reason: "malformed" });
  });

  it("leaks no workout text through any event payload", async () => {
    const { initAnalytics, capture, bucketRowCount, bucketDuration } =
      await loadAnalytics("phc_test");
    initAnalytics();

    capture({ name: "app_opened" });
    capture({
      name: "upload_succeeded",
      props: { rows: bucketRowCount(1209), duration_bucket: bucketDuration(2200) },
    });
    capture({ name: "tab_viewed", props: { tab: "Strength", source: "upload" } });
    capture({ name: "theme_changed", props: { mode: "dark", accent: "amber" } });
    capture({ name: "date_range_changed", props: { preset: "last_3_months" } });
    capture({ name: "granularity_changed", props: { granularity: "weekly" } });

    // Cross-check every payload against real content from the sample export:
    // workout titles, descriptions and athlete notes must appear nowhere.
    const sent = JSON.stringify(mocked.capture.mock.calls).toLowerCase();
    const sample = loadSampleCsvText();
    const titles = sample
      .split("\n")
      .slice(1, 400)
      .map((line) => line.split(",")[1]?.replace(/"/g, "").trim())
      .filter((t): t is string => !!t && t.length > 4);

    for (const title of new Set(titles)) {
      expect(sent, `workout title "${title}" leaked into an event`).not.toContain(
        title.toLowerCase()
      );
    }
    for (const forbidden of ["thruster", "snatch", "deadlift", "burpee", "murph", "tamra", ".csv"]) {
      expect(sent, `"${forbidden}" leaked into an event`).not.toContain(forbidden);
    }
  });
});
