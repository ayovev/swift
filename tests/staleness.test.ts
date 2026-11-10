import { describe, expect, it } from "vitest";
import { logStaleness } from "@/lib/analytics/staleness";
import { staleLogSentence } from "@/components/dashboard/StaleLogNudge";
import { STALE_LOG_DAYS } from "@/lib/analytics/insightConfig";

const TODAY = "2026-11-10";
const NOW = "2026-11-10T12:00:00.000Z";
const base = { uploadedAt: null, snoozedUntil: null, lastWorkoutOn: "2026-10-01", today: TODAY, now: NOW };

describe("logStaleness", () => {
  it("is stale once the upload is STALE_LOG_DAYS old, measured from the upload", () => {
    const r = logStaleness({ ...base, uploadedAt: "2026-10-11T09:00:00" });
    expect(r).toMatchObject({ basis: "upload", days: STALE_LOG_DAYS, uploadedOn: "2026-10-11" });
  });

  it("is not stale one day short of the threshold", () => {
    expect(logStaleness({ ...base, uploadedAt: "2026-10-12T09:00:00" })).toBeNull();
  });

  it("ignores an old last workout when the upload is fresh (a layoff is not a stale file)", () => {
    expect(logStaleness({ ...base, uploadedAt: "2026-11-09T09:00:00", lastWorkoutOn: "2026-08-01" })).toBeNull();
  });

  it("falls back to the last workout for a cache with no upload date", () => {
    expect(logStaleness({ ...base, lastWorkoutOn: "2026-10-01" })).toMatchObject({
      basis: "last-workout",
      days: 40,
      uploadedOn: null,
    });
    expect(logStaleness({ ...base, lastWorkoutOn: "2026-11-01" })).toBeNull();
  });

  it("is null when there is nothing to measure from", () => {
    expect(logStaleness({ ...base, lastWorkoutOn: null })).toBeNull();
  });

  it("never fires for an upload dated in the future (clock skew)", () => {
    expect(logStaleness({ ...base, uploadedAt: "2026-12-25T09:00:00" })).toBeNull();
  });

  it("stays quiet while snoozed and returns once the snooze passes", () => {
    const stale = { ...base, uploadedAt: "2026-09-01T09:00:00" };
    expect(logStaleness({ ...stale, snoozedUntil: "2026-11-15T00:00:00.000Z" })).toBeNull();
    expect(logStaleness({ ...stale, snoozedUntil: "2026-11-09T00:00:00.000Z" })).not.toBeNull();
  });
});

describe("staleLogSentence", () => {
  it("names both dates when the upload date is known", () => {
    const s = logStaleness({ ...base, uploadedAt: "2026-09-01T09:00:00", lastWorkoutOn: "2026-08-28" })!;
    expect(staleLogSentence(s, TODAY)).toBe("Uploaded Sep 1, last workout logged Aug 28. Replace your file to update.");
  });

  it("states the age when only the last workout is known", () => {
    const s = logStaleness(base)!;
    expect(staleLogSentence(s, TODAY)).toBe("Last workout logged Oct 1, 40 days ago. Replace your file to update.");
  });
});
