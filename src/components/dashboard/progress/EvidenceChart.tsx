import { useMemo } from "react";
import { trendLine } from "@/lib/analytics/insights/chart";
import { formatClock, formatSession } from "@/lib/analytics/insights/display";
import type { ProgressSubject } from "@/lib/analytics/insights/sessions";
import { bestSession, dayNumber, roundHalfAway, type ProgressVerdict } from "@/lib/analytics/insights/verdict";

const W = 560;
const H = 170;
const PAD = { l: 52, r: 44, t: 22, b: 30 };
const MAX_X_TICKS = 8;
const TICK_STEPS_MONTHS = [1, 2, 3, 6, 12, 24, 36, 60];
/** Every dot is the same size: colour alone says which group it is in. */
const DOT_R = 3.5;
/** Labels on the y-axis for a load or a time: the lowest and highest dot and evenly spaced values between them. */
const Y_TICKS = 5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const monthYearOfDay = (d: number): string => {
  const date = new Date(Math.round(d) * 86_400_000);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

/**
 * Ticks on the first of a month, on a calendar-aligned step (every month, quarter, half year, year...): the smallest step that gives
 * at most `MAX_X_TICKS` ticks across the span, so a short history reads month by month and a long one year by year. A span too short
 * for even one tick falls back to its two ends.
 */
function xTickDays(x0: number, x1: number): { day: number; label: string }[] {
  const first = new Date(Math.round(x0) * 86_400_000);
  const startIndex = first.getUTCFullYear() * 12 + first.getUTCMonth();
  const endDate = new Date(Math.round(x1) * 86_400_000);
  const endIndex = endDate.getUTCFullYear() * 12 + endDate.getUTCMonth();
  for (const step of TICK_STEPS_MONTHS) {
    const ticks: { day: number; label: string }[] = [];
    for (let m = Math.ceil(startIndex / step) * step; m <= endIndex; m += step) {
      const day = Date.UTC(Math.floor(m / 12), m % 12, 1) / 86_400_000;
      if (day < x0 || day > x1) continue;
      ticks.push({ day, label: step >= 12 && m % 12 === 0 ? String(Math.floor(m / 12)) : monthYearOfDay(day) });
    }
    if (ticks.length <= MAX_X_TICKS) return ticks.length >= 2 ? ticks : [{ day: x0, label: monthYearOfDay(x0) }, { day: x1, label: monthYearOfDay(x1) }];
  }
  return [];
}

/**
 * The chart that opens from a subject's row: one dot per day (the best result of that day, the same series the verdict reads), the
 * previous window's dots dark, the recent window's dots in the accent, every other dot faint grey, all one size. No bands, legend or controls. A dashed
 * trend line through the best of each quarter appears with four or more quarters and carries no number or direction; rings mark max
 * efforts only for a `down` or `not tested since` verdict; a record carries a "new best" label on its (ordinary, accent) dot. A subject without a
 * verdict (a facts line) gets the dots alone. A faster time is drawn higher, so up always reads as up.
 */
export function EvidenceChart({ subject, verdict, domain }: { subject: ProgressSubject; verdict: ProgressVerdict | null; domain?: { start: string; end: string } }) {
  const model = useMemo(() => {
    const sessions = subject.sessions;
    const days = sessions.map((s) => dayNumber(s.date));
    // On the Timeline the axis starts from the timeline's own range, stretched to take in any session outside it so no dot falls off the axis.
    const x0 = Math.min(...days, ...(domain ? [dayNumber(domain.start)] : []));
    const x1 = Math.max(...days, ...(domain ? [dayNumber(domain.end)] : []));
    const values = sessions.map((s) => s.value);
    const v0 = Math.min(...values);
    const v1 = Math.max(...values);
    const X = (d: number): number => PAD.l + ((d - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
    const Y = (v: number): number => {
      const f = (v - v0) / (v1 - v0 || 1);
      return PAD.t + (subject.lowerIsBetter ? f : 1 - f) * (H - PAD.t - PAD.b);
    };
    const previous = new Set(verdict?.previous.map((s) => s.date));
    const recent = new Set(verdict?.recent.map((s) => s.date));
    const trend = verdict ? trendLine(sessions, subject.lowerIsBetter) : null;
    let newBest: { x: number; y: number; label: string } | null = null;
    if (verdict?.record) {
      const earlier = bestSession(sessions.slice(0, sessions.length - verdict.window), subject.lowerIsBetter);
      const sign = subject.lowerIsBetter ? -1 : 1;
      const pct = roundHalfAway(((verdict.recentBest.value - earlier.value) / earlier.value) * sign * 100, 1);
      const value = formatSession(subject, verdict.recentBest).replace(" lb", "");
      newBest = { x: X(dayNumber(verdict.recentBest.date)), y: Y(verdict.recentBest.value), label: `${value} · new best +${pct.toFixed(1)}%` };
    }
    // Axis ticks: the lowest and highest dot on y (named by the sessions themselves, so a score keeps its own wording), plus evenly spaced values between them for a load or a time, calendar-aligned dates on x (`xTickDays`).
    const lo = sessions.reduce((a, b) => (b.value < a.value ? b : a));
    const hi = sessions.reduce((a, b) => (b.value > a.value ? b : a));
    const yTicks = (lo === hi ? [lo] : [lo, hi]).map((t) => ({ y: Y(t.value), label: formatSession(subject, t) }));
    // A load or a time gets evenly spaced values between the two ends (a score such as "17+20" has no value to print between, so it keeps the two).
    if (subject.format !== "rounds-reps" && v1 > v0) {
      yTicks.length = 0;
      for (let i = 0; i < Y_TICKS; i++) {
        const v = v0 + ((v1 - v0) * i) / (Y_TICKS - 1);
        yTicks.push({ y: Y(v), label: subject.format === "load" ? `${Math.round(v)} lb` : formatClock(v) });
      }
    }
    const xTicks = xTickDays(x0, x1).map((t) => ({ x: X(t.day), label: t.label }));
    return { sessions, X, Y, previous, recent, trend, newBest, yTicks, xTicks };
  }, [subject, verdict, domain]);

  const rings = verdict && (verdict.state === "down" || verdict.state === "not-tested-since");
  const { X, Y } = model;
  const caption = verdict
    ? `Each dot is the best result of a day. Dark dots are the ${verdict.window} sessions before the recent ${verdict.window}; accent dots are the recent ${verdict.window}, which are compared. Grey dots are other sessions.${model.trend ? " The dashed line is the long-run trend." : ""}${rings ? " Rings mark max efforts." : ""}`
    : "Each dot is the best result of a day.";

  return (
    <figure className="flex flex-col gap-1">
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
              <circle cx={cx} cy={cy} r={DOT_R} className={fill}>
                <title>{`${s.date} · ${formatSession(subject, s)}${subject.kind === "lift" ? " est." : ""}${s.maxEffort && subject.kind === "lift" ? " · max effort" : ""}`}</title>
              </circle>
            </g>
          );
        })}
        {verdict
          ? [verdict.previousBest, verdict.recentBest].map((b, i) =>
              model.newBest && i === 1 ? null : (
                <text key={b.date} x={X(dayNumber(b.date))} y={Y(b.value) - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {formatSession(subject, b).replace(" lb", "")}
                </text>
              )
            )
          : null}
        {model.newBest ? (
          <g>
            <text x={model.newBest.x} y={model.newBest.y - 10} textAnchor="end" className="fill-accent-link text-[10px] font-medium">
              {model.newBest.label}
            </text>
          </g>
        ) : null}
      </svg>
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
