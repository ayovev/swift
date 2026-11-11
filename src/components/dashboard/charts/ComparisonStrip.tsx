import { Fragment } from "react";
import { MEANINGFUL_DELTA, halvesComparable } from "../TrendStat";
import { FIXED_MODALITY_COLORS, MODALITY_DRAW_ORDER, domainColor } from "./chartUtils";
import { cn } from "@/lib/utils";
import { DOMAIN_LIST, DOMAIN_SHORT_LABELS, type DashboardData, type Domain, type TrendHalves } from "@/types/dashboard";
import { MODALITY_NAMES, type Modality, type ModalityData } from "@/types/modality";

/**
 * All ten domains (or all three modalities) on one view, so "is my training balanced?" no longer means remembering ten numbers
 * across ten tabs. Each domain page used to draw one auto-scaled chart (Strength's axis ran to 100%, Metabolic Conditioning's to
 * 30%), so no two could be compared by eye.
 *
 * The two strips deliberately take different forms, because the numbers mean different things:
 * - domains are independent tags (a workout counts in every domain it touches, so they sum to about 300%): separate bars on one
 *   shared 0 to 100% axis, sorted, the current domain in its chart colour and the rest grey;
 * - modalities are one workout's split (they sum to 100): one stacked bar, in the fixed M/W/G colours, the current one at full
 *   strength and the others faded.
 * Each bar is a button to its own view (through the same tab change as the nav, so `tab_viewed` is the only analytics), and the
 * current one carries aria-current. Each also gives its then-to-now change in points (the same halves as "Then versus now"), as a
 * signed number in plain text: a two-tick mark on an 8px bar was too small to read, and an arrow coloured by direction would put
 * status on colour. A range too short to compare halves shows no change at all.
 */

function changeText(delta: number, halves: TrendHalves | null): string | null {
  if (!halvesComparable(halves)) return null;
  if (Math.abs(delta) < MEANINGFUL_DELTA) return "no change";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(0)} pts`;
}

const rowClass =
  "group grid min-h-11 w-full grid-cols-[6.5rem_1fr_2.75rem] items-center gap-x-3 rounded-md px-1 text-left text-sm sm:min-h-8 sm:grid-cols-[7.5rem_1fr_2.75rem_4.5rem] hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring";

export function DomainStrip({ data, current, onOpen }: { data: DashboardData; current: Domain; onOpen: (tab: string) => void }) {
  const rows = [...DOMAIN_LIST].sort((a, b) => data.overall[b].pct - data.overall[a].pct);
  const anyChange = halvesComparable(data.trend_halves);
  return (
    <section aria-labelledby="domain-strip-title" className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="domain-strip-title" className="text-sm font-medium">
          All ten domains
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Share of workouts touching each domain. A workout counts in every domain it touches, so these add up to more than 100%.
          {anyChange ? " The change is from the first half of these workouts to the second." : ""}
        </p>
      </div>
      <ul className="flex max-w-3xl flex-col" data-strip="domains">
        {rows.map((d) => {
          const on = d === current;
          const pct = data.overall[d].pct;
          const change = changeText(data.trend_direction[d].delta, data.trend_halves);
          return (
            <li key={d}>
              <button type="button" className={rowClass} aria-current={on ? "page" : undefined} onClick={() => onOpen(`domain:${d}`)}>
                <span className={cn("truncate", on ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                  {DOMAIN_SHORT_LABELS[d]}
                </span>
                <span className="relative h-2 rounded-full bg-muted" aria-hidden="true">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    data-bar
                    style={{ width: `${pct}%`, backgroundColor: on ? domainColor(d) : "var(--muted-foreground)", opacity: on ? 1 : 0.35 }}
                  />
                </span>
                <span className={cn("text-right tabular", on ? "font-medium" : "text-muted-foreground")}>{pct.toFixed(0)}%</span>
                {/* The change is a column only from sm: on a phone it would squeeze the bars, and the domain's own page has it. */}
                <span className="hidden text-right text-xs text-muted-foreground tabular sm:block">{change ?? ""}</span>
                <span className="sr-only">{change ? `, ${change === "no change" ? "no change" : `${change} since the first half`}` : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ModalityStrip({ data, current, onOpen }: { data: ModalityData; current: Modality; onOpen: (tab: string) => void }) {
  const share = (m: Modality) => data.modality_overall[m].avg_share;
  const anyChange = halvesComparable(data.modality_trend_halves);
  return (
    <section aria-labelledby="modality-strip-title" className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="modality-strip-title" className="text-sm font-medium">
          All three modalities
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The average split of a classified workout. Adds to 100%.
          {anyChange ? " The change is from the first half of these workouts to the second." : ""}
        </p>
      </div>
      {/* One bar, W, G, M as everywhere else (MODALITY_DRAW_ORDER), so red and green never touch. */}
      <div className="flex h-3 w-full max-w-3xl overflow-hidden rounded-full bg-muted" aria-hidden="true" data-strip="modalities">
        {MODALITY_DRAW_ORDER.map((m, i) => (
          <span
            key={m}
            data-bar={m}
            style={{
              width: `${share(m)}%`,
              backgroundColor: FIXED_MODALITY_COLORS[m],
              opacity: m === current ? 1 : 0.35,
              boxShadow: i < MODALITY_DRAW_ORDER.length - 1 ? "inset -2px 0 0 0 var(--card)" : undefined,
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-2 gap-y-1">
        {MODALITY_DRAW_ORDER.map((m) => {
          const on = m === current;
          const change = changeText(data.modality_trend_direction[m].delta, data.modality_trend_halves);
          return (
            <li key={m}>
              <button
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => onOpen(`modality:${m}`)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm sm:min-h-8 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring",
                  on ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: FIXED_MODALITY_COLORS[m] }} aria-hidden="true" />
                <span>
                  {m} · {MODALITY_NAMES[m]}
                </span>
                <span className="tabular">{share(m).toFixed(0)}%</span>
                {change ? (
                  <Fragment>
                    <span className="text-xs font-normal text-muted-foreground tabular" aria-hidden="true">
                      {change}
                    </span>
                    <span className="sr-only">{change === "no change" ? ", no change" : `, ${change} since the first half`}</span>
                  </Fragment>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
