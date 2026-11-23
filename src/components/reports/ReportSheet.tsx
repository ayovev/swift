import type { ReactNode } from "react";
import dayjs from "dayjs";
import { SwiftMark } from "@/components/SwiftMark";
import { useBrand } from "@/lib/brand/brandStore";
import { plateFor } from "@/lib/brand/image";
import type { Audience } from "@/lib/audience";
import { COACH_NOTE_MAX } from "./reportNote";
import "./report.css";

/**
 * The page every report is printed on (docs/reports.md). It is always the light page, whatever the app's mode (`.report-sheet` in index.css
 * and report.css), so the preview is what prints. It owns what every report shares: the header (a small label, the title, the period and the
 * report date, then one muted row of marks: the gym's logo for a coach and the Swift mark always, R-9), the optional coach note at the end (R-4),
 * and a footer with the basis (R-8), set as a table footer so it repeats on every printed page without overlapping content. A report supplies
 * only its title, its period and its body.
 */
export interface ReportSheetProps {
  title: string;
  /** The dates the report covers, one unbreakable phrase: "Jan 1, 2023 – Dec 31, 2023", or "All time, through Dec 31, 2023". */
  period: string;
  /** An optional quieter line under the period: what the report counts and how. */
  subtitle?: string;
  audience: Audience;
  /** YYYY-MM-DD, the report date. */
  today: string;
  /** The footer's basis: "Workout log through Nov 6, 2026." */
  basis: string;
  /** The coach note; empty or blank prints nothing. */
  note: string;
  /** Light-mode accent variables for this sheet (the app's accent, with the mode taken out of it). */
  style?: React.CSSProperties;
  children: ReactNode;
}

export function ReportSheet({ title, period, subtitle, audience, today, basis, note, style, children }: ReportSheetProps) {
  const { logo, name, tone } = useBrand();
  // Only a coach's report carries the gym's brand; an athlete's has the Swift mark alone.
  const branded = audience === "coach" && (logo || name);
  const plate = plateFor(tone, "light");
  const trimmed = note.trim().slice(0, COACH_NOTE_MAX);

  return (
    <article aria-label={title} className="report-sheet mx-auto w-full max-w-[8.5in] bg-background p-[0.6in] text-foreground shadow-sm max-sm:p-5" style={style}>
      <table className="report-table w-full">
        <tbody>
          <tr>
            <td className="align-top">
              <header className="border-b border-border pb-3" data-testid="report-header">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  {/* The gym's name for a coach, else the product's: what the report comes from, in the accent. */}
                  <p className="min-w-0 text-[11px] font-semibold tracking-[0.14em] text-accent-link uppercase" data-testid="report-label">
                    {branded && name ? name : "Swift"}
                  </p>
                  <div className="flex shrink-0 items-center gap-2.5 opacity-90">
                    {branded && logo ? (
                      <div className="flex items-center gap-2.5" data-testid="report-brand">
                        <img
                          src={logo}
                          alt={name ?? "Gym logo"}
                          style={plate ? { backgroundColor: plate === "light" ? "#ffffff" : "#1c1c1c" } : undefined}
                          className={plate ? "h-6 max-h-6 w-auto max-w-32 object-contain p-0.5" : "h-6 max-h-6 w-auto max-w-32 object-contain"}
                        />
                        <span aria-hidden="true" className="h-4 w-px bg-border" />
                      </div>
                    ) : null}
                    <SwiftMark className="[&_img]:h-5" />
                  </div>
                </div>
                <h2 className="mt-2 text-3xl leading-tight font-semibold break-words">{title}</h2>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
                  <p className="font-medium" data-testid="report-period">{period}</p>
                  <p className="text-muted-foreground" data-testid="report-prepared">Prepared {dayjs(today).format("MMM D, YYYY")}</p>
                </div>
                {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
                <div aria-hidden="true" className="mt-3 h-0.5 w-12 bg-primary" />
              </header>
              <div className="mt-5 flex flex-col gap-6">{children}</div>
              {trimmed ? (
                <section className="report-card mt-8" data-testid="report-note">
                  <h3 className="report-heading text-lg font-semibold">Coach note</h3>
                  <p className="mt-1 text-sm whitespace-pre-wrap break-words">{trimmed}</p>
                </section>
              ) : null}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <footer className="report-footer mt-6 flex items-center justify-between gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
                <span>
                  {basis}
                </span>
                <SwiftMark className="[&_img]:h-5" />
              </footer>
            </td>
          </tr>
        </tfoot>
      </table>
    </article>
  );
}
