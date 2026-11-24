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
 * and report.css), so the preview is what prints. It owns what every report shares: the header (one row with the gym's logo at the left for a coach and the Swift mark at the right, always, R-9; then the title, the period and the
 * report date), the optional coach note at the end (R-4),
 * and a footer with the basis (R-8), set as a table footer so it repeats on every printed page without overlapping content. A report supplies
 * only its title, its period and its body.
 */
export interface ReportSheetProps {
  title: string;
  /** The dates the report covers, one unbreakable phrase: "Jan 1, 2023 – Dec 31, 2023", or "All time, through Dec 31, 2023". */
  period: string;
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

export function ReportSheet({ title, period, audience, today, basis, note, style, children }: ReportSheetProps) {
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
                {/* One row, centered on one line: the gym's logo (a coach's) at the left, the Swift mark at the right. A gym with a name and no logo gets its name in the logo's place. */}
                <div className="flex items-center justify-between gap-4">
                  {branded ? (
                    <div className="flex min-w-0 items-center" data-testid="report-brand">
                      {logo ? (
                        <img
                          src={logo}
                          alt={name ?? "Gym logo"}
                          style={plate ? { backgroundColor: plate === "light" ? "#ffffff" : "#1c1c1c" } : undefined}
                          className={plate ? "h-7 max-h-7 w-auto max-w-48 object-contain p-0.5" : "h-7 max-h-7 w-auto max-w-48 object-contain"}
                        />
                      ) : (
                        <span className="truncate text-base font-semibold">{name}</span>
                      )}
                    </div>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <SwiftMark className="shrink-0 [&_img]:h-7" />
                </div>
                <h2 className="mt-2 text-3xl leading-tight font-semibold break-words">{title}</h2>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
                  <p className="font-medium" data-testid="report-period">{period}</p>
                  <p className="text-muted-foreground" data-testid="report-prepared">Prepared {dayjs(today).format("MMM D, YYYY")}</p>
                </div>
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
