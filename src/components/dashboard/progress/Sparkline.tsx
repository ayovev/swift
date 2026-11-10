import { useMemo } from "react";
import type { ProgressSubject } from "@/lib/analytics/insights/sessions";
import { dayNumber, type ProgressVerdict } from "@/lib/analytics/insights/verdict";

const W = 120;
const H = 24;
const PAD = 3;
const R = 1.75;

/**
 * A row's evidence at a glance, on the collapsed Progress row: the same dots as the opened EvidenceChart and in the same encoding
 * (previous window dark, recent window in the accent, every other session faint grey), with no axes, labels or trend. It repeats what
 * the row's words already say, so it is hidden from assistive tech; the chart it previews is one click away.
 *
 * Without it a row was five to seven lines of text and the evidence stayed hidden until opened, so scanning ten rows for "which of
 * these is a real change" meant opening them one by one.
 */
export function Sparkline({ subject, verdict }: { subject: ProgressSubject; verdict: ProgressVerdict }) {
  const dots = useMemo(() => {
    const days = subject.sessions.map((s) => dayNumber(s.date));
    const values = subject.sessions.map((s) => s.value);
    const x0 = Math.min(...days);
    const x1 = Math.max(...days);
    const v0 = Math.min(...values);
    const v1 = Math.max(...values);
    const previous = new Set(verdict.previous.map((s) => s.date));
    const recent = new Set(verdict.recent.map((s) => s.date));
    // A plain number line, larger values on top, as on the EvidenceChart (a faster time is drawn lower there too).
    return subject.sessions.map((s, i) => ({
      key: s.date,
      x: PAD + ((days[i]! - x0) / (x1 - x0 || 1)) * (W - 2 * PAD),
      y: PAD + (1 - (s.value - v0) / (v1 - v0 || 1)) * (H - 2 * PAD),
      kind: recent.has(s.date) ? "recent" : previous.has(s.date) ? "previous" : "other",
    }));
  }, [subject, verdict]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-20 shrink-0 sm:w-[120px]" aria-hidden data-sparkline>
      {dots
        .filter((d) => d.kind === "other")
        .map((d) => (
          <circle key={d.key} cx={d.x} cy={d.y} r={R} className="fill-muted-foreground/40" />
        ))}
      {dots
        .filter((d) => d.kind !== "other")
        .map((d) => (
          <circle key={d.key} cx={d.x} cy={d.y} r={R} className={d.kind === "recent" ? "fill-accent-link" : "fill-foreground"} />
        ))}
    </svg>
  );
}
