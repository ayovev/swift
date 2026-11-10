import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { trendLine } from "@/lib/analytics/insights/chart";
import { AXIS_TICK_COUNT, CLOCK_STEPS, ROUNDS_REPS_STEPS, formatDate, formatTimeTick, niceAxisTicks, niceTimeTicks } from "@/components/dashboard/charts/chartUtils";
import { formatClock, formatSession, loggedSetText, roundsReps } from "@/lib/analytics/insights/display";
import { PV_MAX_REPS } from "@/lib/analytics/insightConfig";
import { REPS_PER_ROUND, type ProgressSession, type ProgressSubject } from "@/lib/analytics/insights/sessions";
import { bestSession, dayNumber, roundHalfAway, type ProgressVerdict } from "@/lib/analytics/insights/verdict";

/**
 * The chart is drawn at its real pixel width, so its text is the size it says. A fixed 560-wide viewBox scaled to the card made the
 * 10-unit labels about 20px on a desktop and 6px on a phone (measured): the whole chart, text and all, stretched with the card.
 * Before the first measurement (and in jsdom, which has no ResizeObserver) it falls back to this width.
 */
const FALLBACK_W = 560;
/** Height grows with width, within these bounds, so a wide card isn't a thin strip and a phone keeps a readable plot. */
const MIN_H = 170;
const MAX_H = 240;
/** The room a date label at 11px needs on the x axis. */
const MIN_TICK_GAP_PX = 64;
const heightFor = (w: number): number => Math.round(Math.min(MAX_H, Math.max(MIN_H, w * 0.3)));

/** The width of an element, kept up to date as it resizes. */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(FALLBACK_W);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      if (next > 0) setW(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, w];
}
const PAD = { l: 52, r: 44, t: 22, b: 30 };
/** Every dot is the same size: colour alone says which group it is in. */
const DOT_R = 3.5;
const DAY_MS = 86_400_000;
/** Rough size of an 11px label in pixels (one chart unit is a pixel), to tell whether the trend line would run through it. */
const LABEL_CHAR_W = 6.2;
const LABEL_H = 11;
const HIT_R = 9;

/**
 * The chart that opens from a subject's row: one dot per day (the best result of that day, the same series the verdict reads), the
 * previous window's dots dark, the recent window's dots in the accent, every other dot faint grey, all one size. No bands, legend or controls. A dashed
 * trend line through the best of each quarter appears with four or more quarters and carries no number or direction; rings mark max
 * efforts only for a lift with a `down` or `not tested since` verdict; a record carries a "new best" label on its (ordinary, accent) dot. A subject without a
 * verdict (a facts line) gets the dots alone. The y-axis is a plain number line, larger values on top, for a time as for a load: a faster time is drawn lower.
 */
export function EvidenceChart({ subject, verdict, domain }: { subject: ProgressSubject; verdict: ProgressVerdict | null; domain?: { start: string; end: string } }) {
  const [frame, W] = useWidth();
  const H = heightFor(W);
  const model = useMemo(() => {
    const sessions = subject.sessions;
    const days = sessions.map((s) => dayNumber(s.date));
    // On the Timeline the axis starts from the timeline's own range, stretched to take in any session outside it so no dot falls off the axis.
    const x0 = Math.min(...days, ...(domain ? [dayNumber(domain.start)] : []));
    const x1 = Math.max(...days, ...(domain ? [dayNumber(domain.end)] : []));
    const values = sessions.map((s) => s.value);
    // The same axis rule as every other chart (`niceAxisTicks`): the ends round out to a round step and every label is a multiple of it, evenly spaced.
    // A score such as "17+20" has no value to print between its ends, so it keeps the lowest and highest dot's own.
    // A rounds + reps score is only a number to step through when the round is a known size (Cindy: 30 reps), which makes its value a total of reps;
    // otherwise (the raw score's encoding varies) it keeps the lowest and highest dot's own score.
    const repsPerRound = subject.format === "rounds-reps" ? (REPS_PER_ROUND[subject.movement] ?? null) : null;
    const nice =
      subject.format === "rounds-reps" && !repsPerRound
        ? null
        : niceAxisTicks(Math.min(...values), Math.max(...values), AXIS_TICK_COUNT, false, subject.format === "time" ? CLOCK_STEPS : subject.format === "rounds-reps" ? ROUNDS_REPS_STEPS : undefined);
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
      ? nice.ticks.map((v) => ({ y: Y(v), label: subject.format === "load" ? `${v} lb` : repsPerRound ? roundsReps(v, repsPerRound) : formatClock(v) }))
      : (() => {
          const lo = sessions.reduce((a, b) => (b.value < a.value ? b : a));
          const hi = sessions.reduce((a, b) => (b.value > a.value ? b : a));
          return (lo === hi ? [lo] : [lo, hi]).map((t) => ({ y: Y(t.value), label: formatSession(subject, t) }));
        })();
    // As many date ticks as fit at 11px: an "Mmm 'YY" label needs about 64px. Drawn at its real width, a phone's chart has room for
    // four or five, where the old scaled-down chart squeezed in eight of 6px text.
    const dates = niceTimeTicks(x0 * DAY_MS, x1 * DAY_MS, Math.max(2, Math.min(AXIS_TICK_COUNT, Math.floor((W - PAD.l - PAD.r) / MIN_TICK_GAP_PX))));
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
  }, [subject, verdict, domain, W, H]);

  // Lifts only: every benchmark session is a max effort, so a ring on each dot would say nothing.
  const [hovered, setHovered] = useState<ProgressSession | null>(null);
  const rings = verdict && subject.kind === "lift" && (verdict.state === "down" || verdict.state === "not-tested-since");
  const { X, Y } = model;
  const caption = verdict
    ? `Each dot is the best result of a day. Dark dots are the ${verdict.window} sessions before the recent ${verdict.window}; accent dots are the recent ${verdict.window}, which are compared. Grey dots are other sessions.${model.trend ? " The dashed line is the long-run trend." : ""}${rings ? " Rings mark max efforts." : ""}`
    : "Each dot is the best result of a day.";
  // A lift's dots are estimated 1RMs, not loads that were lifted: the axis is titled so and the caption says where they come from.
  const estimated = subject.format === "load";
  const fullCaption = estimated ? `${caption} Loads are estimated one-rep maxes from sets of 1 to ${PV_MAX_REPS} reps.` : caption;

  return (
    <figure className="flex flex-col gap-1">
      <div ref={frame} className="relative" onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={`Sessions of ${subject.name}${estimated ? ", as estimated one-rep maxes" : ""}`}>
        {estimated ? (
          <text x={4} y={9} className="fill-muted-foreground text-[11px]">
            Est. 1RM
          </text>
        ) : null}
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t - 6} y2={H - PAD.b + 6} className="stroke-border" strokeWidth={1} />
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b + 6} y2={H - PAD.b + 6} className="stroke-border" strokeWidth={1} />
        {model.yTicks.map((t) => (
          <g key={t.label}>
            {/* Solid hairlines: a dashed grid reads as a threshold or a projection. The dashed line here is the trend. */}
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
            <text x={PAD.l - 6} y={t.y + 3} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {t.label}
            </text>
          </g>
        ))}
        {model.xTicks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={H - PAD.b + 6} y2={H - PAD.b + 10} className="stroke-border" strokeWidth={1} />
            <text x={t.x} y={H - PAD.b + 21} textAnchor="middle" className="fill-muted-foreground text-[11px]">
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
            <text x={X(model.trend.to.x) + 12} y={Y(model.trend.to.y) + 3} className="fill-muted-foreground text-[11px]">
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
          <text key={l.key} x={l.x} y={l.y} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {l.text}
          </text>
        ))}
        {model.newBest ? (
          <g>
            <text x={model.newBest.x} y={model.newBest.labelY ?? model.newBest.y - 10} textAnchor="end" className="fill-accent-link text-[11px] font-medium">
              {model.newBest.label}
            </text>
          </g>
        ) : null}
      </svg>
      {hovered ? <DotTooltip subject={subject} session={hovered} x={model.X(dayNumber(hovered.date)) / W} y={model.Y(hovered.value) / H} /> : null}
      </div>
      <figcaption className="text-xs text-muted-foreground">{fullCaption}</figcaption>
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
      {lift && loggedSetText(session) ? <span className="text-muted-foreground">from {loggedSetText(session)}</span> : null}
      {lift && session.maxEffort ? <span className="text-accent-link">Max effort</span> : null}
    </div>
  );
}
