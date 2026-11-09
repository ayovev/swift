import { useMemo, useState } from "react";
import { trendLine } from "@/lib/analytics/insights/chart";
import { AXIS_TICK_COUNT, CLOCK_STEPS, formatDate, formatTimeTick, niceAxisTicks, niceTimeTicks } from "@/components/dashboard/charts/chartUtils";
import { formatClock, formatSession } from "@/lib/analytics/insights/display";
import type { ProgressSession, ProgressSubject } from "@/lib/analytics/insights/sessions";
import { bestSession, dayNumber, roundHalfAway, type ProgressVerdict } from "@/lib/analytics/insights/verdict";

const W = 560;
const H = 170;
const PAD = { l: 52, r: 44, t: 22, b: 30 };
/** Every dot is the same size: colour alone says which group it is in. */
const DOT_R = 3.5;
const DAY_MS = 86_400_000;
/** Rough size of a 10px label in chart units, to tell whether the trend line would run through it. */
const LABEL_CHAR_W = 5.6;
const LABEL_H = 10;
const HIT_R = 9;

/**
 * The chart that opens from a subject's row: one dot per day (the best result of that day, the same series the verdict reads), the
 * previous window's dots dark, the recent window's dots in the accent, every other dot faint grey, all one size. No bands, legend or controls. A dashed
 * trend line through the best of each quarter appears with four or more quarters and carries no number or direction; rings mark max
 * efforts only for a lift with a `down` or `not tested since` verdict; a record carries a "new best" label on its (ordinary, accent) dot. A subject without a
 * verdict (a facts line) gets the dots alone. The y-axis is a plain number line, larger values on top, for a time as for a load: a faster time is drawn lower.
 */
export function EvidenceChart({ subject, verdict, domain }: { subject: ProgressSubject; verdict: ProgressVerdict | null; domain?: { start: string; end: string } }) {
  const model = useMemo(() => {
    const sessions = subject.sessions;
    const days = sessions.map((s) => dayNumber(s.date));
    // On the Timeline the axis starts from the timeline's own range, stretched to take in any session outside it so no dot falls off the axis.
    const x0 = Math.min(...days, ...(domain ? [dayNumber(domain.start)] : []));
    const x1 = Math.max(...days, ...(domain ? [dayNumber(domain.end)] : []));
    const values = sessions.map((s) => s.value);
    // The same axis rule as every other chart (`niceAxisTicks`): the ends round out to a round step and every label is a multiple of it, evenly spaced.
    // A score such as "17+20" has no value to print between its ends, so it keeps the lowest and highest dot's own.
    const nice = subject.format === "rounds-reps" ? null : niceAxisTicks(Math.min(...values), Math.max(...values), AXIS_TICK_COUNT, false, subject.format === "time" ? CLOCK_STEPS : undefined);
    const v0 = nice ? nice.domain[0] : Math.min(...values);
    const v1 = nice ? nice.domain[1] : Math.max(...values);
    const X = (d: number): number => PAD.l + ((d - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
    const Y = (v: number): number => {
      const f = (v - v0) / (v1 - v0 || 1);
      return PAD.t + (1 - f) * (H - PAD.t - PAD.b);
    };
    const previous = new Set(verdict?.previous.map((s) => s.date));
    const recent = new Set(verdict?.recent.map((s) => s.date));
    const trend = verdict ? trendLine(sessions, subject.lowerIsBetter) : null;
    let newBest: { x: number; y: number; label: string; labelY?: number } | null = null;
    if (verdict?.record) {
      const earlier = bestSession(sessions.slice(0, sessions.length - verdict.window), subject.lowerIsBetter);
      const sign = subject.lowerIsBetter ? -1 : 1;
      const pct = roundHalfAway(((verdict.recentBest.value - earlier.value) / earlier.value) * sign * 100, 1);
      const value = formatSession(subject, verdict.recentBest).replace(" lb", "");
      newBest = { x: X(dayNumber(verdict.recentBest.date)), y: Y(verdict.recentBest.value), label: `${value} · new best +${pct.toFixed(1)}%` };
    }
    const yTicks = nice
      ? nice.ticks.map((v) => ({ y: Y(v), label: subject.format === "load" ? `${v} lb` : formatClock(v) }))
      : (() => {
          const lo = sessions.reduce((a, b) => (b.value < a.value ? b : a));
          const hi = sessions.reduce((a, b) => (b.value > a.value ? b : a));
          return (lo === hi ? [lo] : [lo, hi]).map((t) => ({ y: Y(t.value), label: formatSession(subject, t) }));
        })();
    const dates = niceTimeTicks(x0 * DAY_MS, x1 * DAY_MS);
    const xTicks = dates.ticks.map((t) => ({ x: X(t / DAY_MS), label: formatTimeTick(t, dates.unit) }));
    // A value label sits above its dot, or below it when the trend line would run through it (and the axis is clear).
    const trendAt = (x: number): number | null => {
      if (!trend) return null;
      const ax = X(trend.from.x);
      const bx = X(trend.to.x);
      if (x < ax || x > bx) return null;
      return Y(trend.from.y) + ((Y(trend.to.y) - Y(trend.from.y)) * (x - ax)) / (bx - ax || 1);
    };
    const axisY = H - PAD.b + 6;
    const labelBaseline = (x: number, y: number, text: string, anchor: "middle" | "end", gap: number): number => {
      const width = text.length * LABEL_CHAR_W;
      const from = anchor === "end" ? x - width : x - width / 2;
      const hits = (baseline: number): boolean =>
        Array.from({ length: 6 }, (_, i) => trendAt(from + (width * i) / 5)).some((ty) => ty !== null && ty > baseline - LABEL_H - 2 && ty < baseline + 3);
      const above = y - gap;
      const below = y + gap + LABEL_H;
      return hits(above) && !hits(below) && below + 3 < axisY ? below : above;
    };
    const valueLabels = verdict
      ? [verdict.previousBest, verdict.recentBest].flatMap((b, i) => {
          if (newBest && i === 1) return [];
          const text = formatSession(subject, b).replace(" lb", "");
          const x = X(dayNumber(b.date));
          const y = Y(b.value);
          return [{ key: b.date, x, y: labelBaseline(x, y, text, "middle", 8), text }];
        })
      : [];
    if (newBest) newBest = { ...newBest, labelY: labelBaseline(newBest.x, newBest.y, newBest.label, "end", 10) };
    return { sessions, X, Y, previous, recent, trend, newBest, yTicks, xTicks, valueLabels };
  }, [subject, verdict, domain]);

  // Lifts only: every benchmark session is a max effort, so a ring on each dot would say nothing.
  const [hovered, setHovered] = useState<ProgressSession | null>(null);
  const rings = verdict && subject.kind === "lift" && (verdict.state === "down" || verdict.state === "not-tested-since");
  const { X, Y } = model;
  const caption = verdict
    ? `Each dot is the best result of a day. Dark dots are the ${verdict.window} sessions before the recent ${verdict.window}; accent dots are the recent ${verdict.window}, which are compared. Grey dots are other sessions.${model.trend ? " The dashed line is the long-run trend." : ""}${rings ? " Rings mark max efforts." : ""}`
    : "Each dot is the best result of a day.";

  return (
    <figure className="flex flex-col gap-1">
      <div className="relative" onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Sessions of ${subject.name}`}>
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t - 6} y2={H - PAD.b + 6} className="stroke-border" strokeWidth={1} />
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b + 6} y2={H - PAD.b + 6} className="stroke-border" strokeWidth={1} />
        {model.yTicks.map((t) => (
          <g key={t.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={0.5} strokeDasharray="2 3" />
            <text x={PAD.l - 6} y={t.y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {t.label}
            </text>
          </g>
        ))}
        {model.xTicks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={H - PAD.b + 6} y2={H - PAD.b + 10} className="stroke-border" strokeWidth={1} />
            <text x={t.x} y={H - PAD.b + 21} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {t.label}
            </text>
          </g>
        ))}
        {model.trend ? (
          <g>
            <line
              x1={X(model.trend.from.x)}
              y1={Y(model.trend.from.y)}
              x2={X(model.trend.to.x)}
              y2={Y(model.trend.to.y)}
              className="stroke-muted-foreground"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <text x={X(model.trend.to.x) + 12} y={Y(model.trend.to.y) + 3} className="fill-muted-foreground text-[10px]">
              Trend
            </text>
          </g>
        ) : null}
        {model.sessions.map((s) => {
          const isRecent = model.recent.has(s.date);
          const isPrevious = model.previous.has(s.date);
          const cx = X(dayNumber(s.date));
          const cy = Y(s.value);
          const fill = isRecent ? "fill-accent-link" : isPrevious ? "fill-foreground" : "fill-muted-foreground/40";
          return (
            <g key={s.date}>
              {rings && s.maxEffort ? <circle cx={cx} cy={cy} r={7} className="fill-none stroke-accent-link" strokeWidth={1.25} /> : null}
              <circle cx={cx} cy={cy} r={DOT_R} className={fill} {...(hovered?.date === s.date ? { stroke: "currentColor", strokeWidth: 1.5 } : {})} />
              {/* A larger invisible target than the dot itself, so it is easy to hover or tap. */}
              <circle cx={cx} cy={cy} r={HIT_R} fill="transparent" className="cursor-pointer" onMouseEnter={() => setHovered(s)} onClick={() => setHovered((h) => (h?.date === s.date ? null : s))} />
            </g>
          );
        })}
        {model.valueLabels.map((l) => (
          <text key={l.key} x={l.x} y={l.y} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {l.text}
          </text>
        ))}
        {model.newBest ? (
          <g>
            <text x={model.newBest.x} y={model.newBest.labelY ?? model.newBest.y - 10} textAnchor="end" className="fill-accent-link text-[10px] font-medium">
              {model.newBest.label}
            </text>
          </g>
        ) : null}
      </svg>
      {hovered ? <DotTooltip subject={subject} session={hovered} x={model.X(dayNumber(hovered.date)) / W} y={model.Y(hovered.value) / H} /> : null}
      </div>
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

/**
 * The same card as the other charts' tooltips (`ChartTooltipContent`): the value, the date, and for a lift whether it was a max effort.
 * Placed over the chart by the dot's share of its width and height, above the dot and flipped below it near the top, and kept inside
 * the chart at either side.
 */
function DotTooltip({ subject, session, x, y }: { subject: ProgressSubject; session: ProgressSession; x: number; y: number }) {
  const lift = subject.kind === "lift";
  const shift = x > 0.7 ? "-100%" : x < 0.3 ? "0%" : "-50%";
  const below = y < 0.3;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 grid min-w-[8rem] gap-0.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: `translate(${shift}, ${below ? "12px" : "calc(-100% - 12px)"})` }}
    >
      <span className="font-medium tabular">
        {formatSession(subject, session)}
        {lift ? " est." : ""}
      </span>
      <span className="text-muted-foreground">{formatDate(session.date)}</span>
      {lift && session.maxEffort ? <span className="text-accent-link">Max effort</span> : null}
    </div>
  );
}
