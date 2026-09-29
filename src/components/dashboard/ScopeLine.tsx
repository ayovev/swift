import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateRangePicker } from "./DateRangePicker";
import type { DateRange, DateRangePreset } from "@/lib/analytics/dateRange";
import { GRANULARITY_OPTIONS, MAX_DAILY_SPAN_DAYS, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";

/** An inline, dashed-underline trigger — a control that reads as part of the sentence around it. */
export const INLINE_TRIGGER =
  "inline-flex items-center gap-0.5 border-b border-dashed border-muted-foreground/70 pb-px font-medium text-foreground hover:border-foreground";

const GRANULARITY_PHRASE: Record<Granularity, string> = {
  daily: "by day",
  weekly: "by week",
  monthly: "by month",
  quarterly: "by quarter",
  yearly: "by year",
};

const MAX_DAILY_SPAN_YEARS = Math.round(MAX_DAILY_SPAN_DAYS / 365);
const DAILY_DISABLED_REASON = `Ranges under ${MAX_DAILY_SPAN_YEARS} year${MAX_DAILY_SPAN_YEARS === 1 ? "" : "s"}`;

interface ScopeLineProps {
  /** The uploaded log's own full span — bounds and disables the calendar. */
  dateBounds: DateRange;
  range: DateRange | null;
  rangePreset: DateRangePreset;
  onRangeSelect: (range: DateRange | null, preset: DateRangePreset) => void;
  granularity: Granularity;
  onGranularityChange: (granularity: Granularity) => void;
  /** True once the selected range (or the full log, at "all time") outgrows daily's legibility. */
  dailyDisabled: boolean;
}

/**
 * The two view-scope controls — date range and grouping — written as one
 * sentence under the page title: "Showing all time, grouped by month."
 *
 * They used to sit in the global header beside theme, sync and file
 * controls, which made them look like app settings. They're not: they
 * change what the charts directly below show, on nearly every visit, so
 * they live next to that content and read as a description of it. Views
 * the range doesn't apply to (Insights) render a plain sentence saying so
 * instead of this — see Dashboard.tsx.
 */
export function ScopeLine(props: ScopeLineProps) {
  const selectGranularity = (id: Granularity) => {
    if (id === props.granularity) return;
    props.onGranularityChange(id);
    capture({ name: "granularity_changed", props: { granularity: id } });
  };

  return (
    <p className="text-base text-muted-foreground">
      Showing{" "}
      <DateRangePicker
        inline
        dateBounds={props.dateBounds}
        value={props.range}
        preset={props.rangePreset}
        onSelect={props.onRangeSelect}
      />
      , grouped{" "}
      <DropdownMenu>
        <DropdownMenuTrigger className={INLINE_TRIGGER} aria-label={`Grouped ${GRANULARITY_PHRASE[props.granularity]}`}>
          {GRANULARITY_PHRASE[props.granularity]}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={props.granularity}
            onValueChange={(v) => selectGranularity(v as Granularity)}
          >
            {GRANULARITY_OPTIONS.map((o) => {
              const disabled = o.id === "daily" && props.dailyDisabled;
              return (
                <DropdownMenuRadioItem key={o.id} value={o.id} disabled={disabled}>
                  {o.label}
                  {disabled ? (
                    <span className="ml-3 text-xs text-muted-foreground">{DAILY_DISABLED_REASON}</span>
                  ) : null}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      .
    </p>
  );
}
