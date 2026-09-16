import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendStatProps {
  earlyPct: number;
  latePct: number;
  delta: number;
  /** What the percentages mean — these differ between domains and modalities. */
  unitLabel: string;
}

/** "Meaningful" here is a judgement call, stated once rather than scattered. */
const MEANINGFUL_DELTA = 1;

/** Early-vs-late comparison. */
export function TrendStat({ earlyPct, latePct, delta, unitLabel }: TrendStatProps) {
  const flat = Math.abs(delta) < MEANINGFUL_DELTA;
  const Icon = flat ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <div className="text-2xl font-semibold tabular">{earlyPct.toFixed(1)}%</div>
        <div className="text-xs text-muted-foreground">first half</div>
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
        <div className="text-xs text-muted-foreground">most recent half</div>
      </div>

      <p className="w-full text-sm leading-relaxed text-muted-foreground">
        {flat
          ? `Your ${unitLabel} has stayed about the same across your log.`
          : delta > 0
            ? `Your ${unitLabel} has gone up over time.`
            : `Your ${unitLabel} has come down over time.`}
      </p>
    </div>
  );
}
