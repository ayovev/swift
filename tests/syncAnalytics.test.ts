import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import { loadSampleCsvText } from "./fixtures/sampleRows";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), capture: vi.fn(), identify: vi.fn() },
}));

const mocked = vi.mocked(posthog);

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

describe("analytics — sync events", () => {
  it("sends the sync lifecycle events for both roles", async () => {
    const { initAnalytics, capture, bucketRowCount } = await loadAnalytics("phc_test");
    initAnalytics();

    capture({ name: "sync_attempted", props: { role: "host" } });
    capture({ name: "sync_succeeded", props: { role: "host", rows: bucketRowCount(1209) } });
    capture({ name: "sync_attempted", props: { role: "joiner" } });
    capture({ name: "sync_failed", props: { role: "joiner", reason: "connection_dropped" } });

    expect(mocked.capture.mock.calls.map((c) => c[0])).toEqual([
      "sync_attempted",
      "sync_succeeded",
      "sync_attempted",
      "sync_failed",
    ]);
  });

  it("sends only role and a closed-vocabulary reason for sync_failed, never anything else", async () => {
    const { initAnalytics, capture } = await loadAnalytics("phc_test");
    initAnalytics();
    capture({ name: "sync_failed", props: { role: "joiner", reason: "invalid_qr" } });
    const [, props] = mocked.capture.mock.calls[0]!;
    expect(props).toEqual({ role: "joiner", reason: "invalid_qr" });
    expect(Object.keys(props as object).sort()).toEqual(["reason", "role"]);
  });

  it("sends only role and a bucketed row count for sync_succeeded, never an exact count", async () => {
    const { initAnalytics, capture, bucketRowCount } = await loadAnalytics("phc_test");
    initAnalytics();
    capture({ name: "sync_succeeded", props: { role: "host", rows: bucketRowCount(1209) } });
    const [, props] = mocked.capture.mock.calls[0]!;
    expect(props).toEqual({ role: "host", rows: "500_1500" });
    expect(JSON.stringify(props)).not.toContain("1209");
  });

  it("never leaks a device name, session id, or SDP-shaped string through a sync event", async () => {
    const { initAnalytics, capture, bucketRowCount } = await loadAnalytics("phc_test");
    initAnalytics();

    // A plausible fake "leak" the payload TYPES must make structurally
    // impossible to pass through capture(), not just avoid by convention.
    const fakeSdp = "v=0\r\no=- 1 1 IN IP4 192.0.2.1\r\ns=-\r\na=candidate:1 1 udp 1 192.0.2.1 5000 typ host";
    const fakeSessionId = crypto.randomUUID();

    capture({ name: "sync_attempted", props: { role: "host" } });
    capture({ name: "sync_succeeded", props: { role: "host", rows: bucketRowCount(1209) } });
    capture({ name: "sync_failed", props: { role: "joiner", reason: "connection_dropped" } });

    const sent = JSON.stringify(mocked.capture.mock.calls);
    expect(sent).not.toContain(fakeSdp);
    expect(sent).not.toContain(fakeSessionId);
    expect(sent).not.toContain("192.0.2.1");
  });

  it("leaks no workout text through a sync event payload", async () => {
    const { initAnalytics, capture, bucketRowCount } = await loadAnalytics("phc_test");
    initAnalytics();

    capture({ name: "sync_attempted", props: { role: "joiner" } });
    capture({ name: "sync_succeeded", props: { role: "joiner", rows: bucketRowCount(1209) } });

    const sent = JSON.stringify(mocked.capture.mock.calls).toLowerCase();
    const sample = loadSampleCsvText();
    const titles = sample
      .split("\n")
      .slice(1, 400)
      .map((line) => line.split(",")[1]?.replace(/"/g, "").trim())
      .filter((t): t is string => !!t && t.length > 4);

    for (const title of new Set(titles)) {
      expect(sent, `workout title "${title}" leaked into a sync event`).not.toContain(title.toLowerCase());
    }
  });
});
