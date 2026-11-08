import { useMemo } from "react";
import { trendLine } from "@/lib/analytics/insights/chart";
import { formatSession } from "@/lib/analytics/insights/display";
import type { ProgressSubject } from "@/lib/analytics/insights/sessions";
import { bestSession, dayNumber, roundHalfAway, type ProgressVerdict } from "@/lib/analytics/insights/verdict";

const W = 560;
const H = 170;
const PAD = { l: 52, r: 44, t: 22, b: 30 };
const X_TICKS = 4;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 2026" from a day number (days since 1970-01-01, as `dayNumber` gives). */
const monthYearOfDay = (d: number): string => {
  const iso = new Date(Math.round(d) * 86_400_000).toISOString();
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
};

/**
 * The chart that opens from a subject's row: one dot per day (the best result of that day, the same series the verdict reads), the
 * previous window's dots dark, the recent window's dots in the accent, every other dot faint. No bands, legend or controls. A dashed
 * trend line through the best of each quarter appears with four or more quarters and carries no number or direction; rings mark max
 * efforts only for a `down` or `not tested since` verdict; a record carries a larger accent dot with "new best". A subject without a
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
    // Axis ticks: the lowest and highest dot on y (named by the sessions themselves, so a score keeps its own wording), evenly spaced dates on x.
    const lo = sessions.reduce((a, b) => (b.value < a.value ? b : a));
    const hi = sessions.reduce((a, b) => (b.value > a.value ? b : a));
    const yTicks = (lo === hi ? [lo] : [lo, hi]).map((t) => ({ y: Y(t.value), label: formatSession(subject, t) }));
    const xTicks = Array.from({ length: x1 > x0 ? X_TICKS : 1 }, (_, i) => {
      const d = x0 + ((x1 - x0) * i) / (X_TICKS - 1);
      return { x: X(d), label: monthYearOfDay(d) };
    });
    return { sessions, X, Y, previous, recent, trend, newBest, yTicks, xTicks };
  }, [subject, verdict, domain]);

  const rings = verdict && (verdict.state === "down" || verdict.state === "not-tested-since");
  const { X, Y } = model;
  const caption = verdict
    ? `Each dot is the best result of a day. Dark dots are the ${verdict.window} sessions before the recent ${verdict.window}; accent dots are the recent ${verdict.window}, which are compared.${model.trend ? " The dashed line is the long-run trend." : ""}${rings ? " Rings mark max efforts." : ""}`
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
              <circle cx={cx} cy={cy} r={isRecent || isPrevious ? 3.5 : 2.5} className={fill}>
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
            <circle cx={model.newBest.x} cy={model.newBest.y} r={5.5} className="fill-accent-link" />
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
