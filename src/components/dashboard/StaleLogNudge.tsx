import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePickerButton } from "./FilePickerButton";
import { shortDate } from "@/lib/analytics/overview";
import type { LogStaleness } from "@/lib/analytics/staleness";
import { capture } from "@/lib/posthog";

interface StaleLogNudgeProps {
  staleness: LogStaleness;
  today: string;
  /**
   * Whether to name the last workout's date. Overview already prints it on the line above, so
   * repeating it there is noise; the Insights views do not, so they get it here.
   */
  includeLastWorkout: boolean;
  /** The same handler Settings' "Replace file" uses, so a refresh behaves identically. */
  onWorkoutFile: (file: File) => void;
  onSnooze: () => void;
}

/**
 * The facts the nudge states, in the voice of the rest of the app: what is true, then the way out.
 * The age leads, since the reader would otherwise have to work it out from a date.
 */
export function staleLogSentence(s: LogStaleness, today: string, includeLastWorkout = true): string {
  const last = s.lastWorkoutOn && includeLastWorkout ? shortDate(s.lastWorkoutOn, today) : null;
  if (s.basis === "upload" && s.uploadedOn) {
    return `Uploaded ${s.days} days ago (${shortDate(s.uploadedOn, today)})${last ? `, last workout logged ${last}` : ""}. Upload a newer export.`;
  }
  if (s.lastWorkoutOn) {
    return `Last workout logged ${last ? `${last}, ` : ""}${s.days} days ago. Upload a newer export.`;
  }
  return "This log is out of date. Upload a newer export.";
}

/**
 * A quiet line, not a banner or dialog: the log is old enough that a newer
 * export probably exists. Shown on Overview and the Insights views, which read
 * the whole history as of today; see Dashboard.tsx.
 */
export function StaleLogNudge({ staleness, today, includeLastWorkout, onWorkoutFile, onSnooze }: StaleLogNudgeProps) {
  return (
    <aside
      aria-label="Workout log may be out of date"
      className="flex flex-col gap-3 rounded-md border border-accent-border bg-accent-subtle px-4 py-2.5 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {/* The icon matches the sample-mode strip's (accent-link, small, decorative) so the two
            page-level notices read as one family. Top-aligned so it stays with the first line when
            the sentence wraps at phone width. */}
        <p className="flex items-start gap-2.5 leading-relaxed">
          <History className="mt-0.5 size-4 shrink-0 text-accent-link" aria-hidden="true" />
          {/* A non-breaking space inside each "Sep 11" so a date never splits across lines at phone width. */}
          <span>{staleLogSentence(staleness, today, includeLastWorkout).replace(/([A-Z][a-z]{2}) (\d)/g, "$1\u00a0$2")}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <FilePickerButton
            variant="default"
            ariaLabel="Replace workout log"
            className="h-8"
            onFile={(file) => {
              capture({ name: "interaction_used", props: { interaction: "stale_log_replace_clicked" } });
              onWorkoutFile(file);
            }}
          >
            Replace file
          </FilePickerButton>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => {
              capture({ name: "interaction_used", props: { interaction: "stale_log_snoozed" } });
              onSnooze();
            }}
          >
            Remind me later
          </Button>
        </div>
      </div>
    </aside>
  );
}
