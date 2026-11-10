import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { monthSpan } from "@/lib/analytics/insights/display";
import { cn } from "@/lib/utils";
import type { TrendHalves } from "@/types/dashboard";

interface TrendStatProps {
  earlyPct: number;
  latePct: number;
  delta: number;
  /** What the percentages mean — these differ between domains and modalities. */
  unitLabel: string;
  /** The dates each half covers. Without them "first half" said nothing about when "then" was. */
  halves: TrendHalves | null;
}

/** "Meaningful" here is a judgement call, stated once rather than scattered. */
const MEANINGFUL_DELTA = 1;

/**
 * Under this, from the first workout to the last, the two halves are too close together to call a change "over time": a month's
 * range split in two is two fortnights. Days rather than buckets, because the halves are cut by workout count and the grouping
 * never changes them.
 */
export const TREND_MIN_SPAN_DAYS = 56;

const DAY_MS = 86_400_000;
const spanDays = (h: TrendHalves): number => (Date.parse(h.late.to) - Date.parse(h.early.from)) / DAY_MS;

/** Early-vs-late comparison, each half named by its dates. */
export function TrendStat({ earlyPct, latePct, delta, unitLabel, halves }: TrendStatProps) {
  if (!halves || spanDays(halves) < TREND_MIN_SPAN_DAYS) {
    return (
      <p className="text-sm text-muted-foreground">
        Too short a range to compare halves. Widen the date range to see whether this has changed.
      </p>
    );
  }
  const flat = Math.abs(delta) < MEANINGFUL_DELTA;
  const Icon = flat ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <div className="text-2xl font-semibold tabular">{earlyPct.toFixed(1)}%</div>
        <div className="text-xs text-muted-foreground">{monthSpan(halves.early.from, halves.early.to)}</div>
      </div>

      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium",
          flat ? "bg-muted text-muted-foreground" : "bg-accent-subtle text-accent-link"
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span className="tabular">
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)} pts
        </span>
      </div>

      <div>
        <div className="text-2xl font-semibold tabular">{latePct.toFixed(1)}%</div>
        <div className="text-xs text-muted-foreground">{monthSpan(halves.late.from, halves.late.to)}</div>
      </div>

      <p className="w-full text-sm leading-relaxed text-muted-foreground">
        The first and second half of the workouts in this range, by count.{" "}
        {flat
          ? `Your ${unitLabel} has stayed about the same across your log.`
          : delta > 0
            ? `Your ${unitLabel} has gone up over time.`
            : `Your ${unitLabel} has come down over time.`}
      </p>
    </div>
  );
}
