import { SegmentedControl } from "../SegmentedControl";
import { PERIOD_OPTIONS, type PeriodPreset } from "@/lib/analytics/insights/period";

interface PeriodFilterProps {
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  custom: { start: string; end: string };
  onCustom: (c: { start: string; end: string }) => void;
  invalid: boolean;
  /** "Showing 5 of 45 subjects." while a period is chosen. */
  showing: string | null;
}

/**
 * Chooses which subjects are listed, by when each was last logged. It changes no verdict, label, count or chart, and is not saved.
 * Labelled by what it does: a bare "Logged in" sat right under "the date range doesn't apply here" and read as a date range.
 */
export const PERIOD_FILTER_LABEL = "Show lifts and benchmarks last logged in";
export function PeriodFilter({ preset, onPreset, custom, onCustom, invalid, showing }: PeriodFilterProps) {
  return (
    <div className="flex flex-col gap-2">
      <span id="progress-logged-in" className="text-xs font-medium text-muted-foreground">
        {PERIOD_FILTER_LABEL}
      </span>
      <div aria-labelledby="progress-logged-in" className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl value={preset} onChange={onPreset} options={PERIOD_OPTIONS} ariaLabel={PERIOD_FILTER_LABEL} />
        </div>
        {preset === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <label className="flex items-center gap-1.5">
              From
              <input
                type="date"
                value={custom.start}
                onChange={(e) => onCustom({ ...custom, start: e.target.value })}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
            <label className="flex items-center gap-1.5">
              To
              <input
                type="date"
                value={custom.end}
                onChange={(e) => onCustom({ ...custom, end: e.target.value })}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
          </div>
        ) : null}
      </div>
      {invalid ? <p className="text-sm text-destructive">The start date is after the end date.</p> : null}
      {showing ? <p className="text-xs text-muted-foreground">{showing}</p> : null}
    </div>
  );
}
