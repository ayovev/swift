import { Button } from "@/components/ui/button";
import { FilePickerButton } from "./FilePickerButton";
import { shortDate } from "@/lib/analytics/overview";
import type { LogStaleness } from "@/lib/analytics/staleness";
import { capture } from "@/lib/posthog";

interface StaleLogNudgeProps {
  staleness: LogStaleness;
  today: string;
  /** The same handler Settings' "Replace file" uses, so a refresh behaves identically. */
  onWorkoutFile: (file: File) => void;
  onSnooze: () => void;
}

/** The two facts the nudge states, in the voice of the rest of the app: what is true, then the way out. */
export function staleLogSentence(s: LogStaleness, today: string): string {
  const last = s.lastWorkoutOn ? `last workout logged ${shortDate(s.lastWorkoutOn, today)}` : null;
  if (s.basis === "upload" && s.uploadedOn) {
    return `Uploaded ${shortDate(s.uploadedOn, today)}${last ? `, ${last}` : ""}. Replace your file to update.`;
  }
  return `${last ? `Last workout logged ${shortDate(s.lastWorkoutOn!, today)}, ${s.days} days ago` : "This log is out of date"}. Replace your file to update.`;
}

/**
 * A quiet line, not a banner or dialog: the log is old enough that a newer
 * export probably exists. Shown on Overview and the Insights views, which read
 * the whole history as of today; see Dashboard.tsx.
 */
export function StaleLogNudge({ staleness, today, onWorkoutFile, onSnooze }: StaleLogNudgeProps) {
  return (
    <aside
      aria-label="Workout log may be out of date"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-md border border-accent-border bg-accent-subtle px-4 py-2.5 text-sm"
    >
      <p>{staleLogSentence(staleness, today)}</p>
      <div className="flex items-center gap-2">
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
    </aside>
  );
}
