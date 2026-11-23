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
 * and report.css), so the preview is what prints. It owns what every report shares: the header (the gym's logo and name for a coach, the
 * Swift mark always, R-9), the optional coach note at the end (R-4), and a footer with the basis and the report date (R-8), set as a table
 * footer so it repeats on every printed page without overlapping content. A report supplies only its title and its body.
 */
export interface ReportSheetProps {
  title: string;
  /** One line under the title: what the report covers and how. */
  subtitle: string;
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

export function ReportSheet({ title, subtitle, audience, today, basis, note, style, children }: ReportSheetProps) {
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
              <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b-2 border-primary pb-3">
                {/* On a phone the title takes the whole row and the marks wrap under it, so a long title does not wrap one word to a line. */}
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <h2 className="text-2xl font-semibold break-words">{title}</h2>
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {branded ? (
                    <div className="flex items-center gap-2" data-testid="report-brand">
                      {logo ? (
                        <img
                          src={logo}
                          alt={name ?? "Gym logo"}
                          style={plate ? { backgroundColor: plate === "light" ? "#ffffff" : "#1c1c1c" } : undefined}
                          className={plate ? "h-8 max-h-8 w-auto max-w-40 object-contain p-1" : "h-8 max-h-8 w-auto max-w-40 object-contain"}
                        />
                      ) : null}
                      {name && !logo ? <span className="text-sm font-semibold">{name}</span> : null}
                      <span aria-hidden="true" className="h-5 w-px bg-border" />
                    </div>
                  ) : null}
                  <SwiftMark className="[&_img]:h-7" />
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
                  {basis} Report date {dayjs(today).format("MMM D, YYYY")}.
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
