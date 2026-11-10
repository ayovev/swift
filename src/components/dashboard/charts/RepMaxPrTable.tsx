import { useMemo } from "react";
import dayjs from "dayjs";
import { currentTrackedPrs } from "@/lib/analytics/repMax";
import { REP_MAX_CATEGORY_ORDER, formatDate } from "./chartUtils";
import type { LiftEntry } from "@/types/dashboard";

/**
 * One row per movement that has a current PR at a tracked rep-max scheme
 * (1/2/3/5RM), with a column per scheme — a quick-reference summary so an
 * athlete doesn't have to hunt through a dozen scatter charts to see where
 * their numbers currently stand.
 *
 * On a phone the five columns left each date wrapping over three lines ("Jul / 5, / 2023"), so below `sm` it is a list instead: one
 * lift per entry, each rep max on its own line with a short date. Same rows, same order.
 */
export function RepMaxPrTable({ lifts }: { lifts: Record<string, LiftEntry[]> }) {
  const rows = useMemo(
    () =>
      Object.entries(lifts)
        .map(([name, entries]) => ({ name, prs: currentTrackedPrs(entries) }))
        .filter(({ prs }) => Object.keys(prs).length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lifts]
  );

  if (rows.length === 0) return null;

  return (
    <>
    <ul className="mb-4 flex flex-col sm:hidden" aria-label="Current PR at each rep max">
      {rows.map(({ name, prs }) => (
        <li key={name} className="border-b border-border py-2 last:border-0">
          <span className="text-sm font-medium">{name}</span>
          <span className="mt-0.5 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground tabular">
            {REP_MAX_CATEGORY_ORDER.filter((c) => prs[c]).map((c) => (
              <span key={c}>
                {c} <span className="font-medium text-foreground">{prs[c]!.value.toLocaleString()}</span> · {dayjs(prs[c]!.date).format("MMM 'YY")}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
    <div className="mb-4 hidden overflow-x-auto sm:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">Movement</th>
            {REP_MAX_CATEGORY_ORDER.map((category) => (
              <th key={category} className="py-1.5 px-3 text-right font-medium">
                {category}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, prs }) => (
            <tr key={name} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3 font-medium">{name}</td>
              {REP_MAX_CATEGORY_ORDER.map((category) => {
                const pr = prs[category];
                return (
                  <td key={category} className="py-1.5 px-3 text-right tabular">
                    {pr ? (
                      <span className="flex flex-col items-end">
                        <span className="font-medium">{pr.value.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(pr.date)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
