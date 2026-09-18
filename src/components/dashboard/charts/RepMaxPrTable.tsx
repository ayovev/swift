import { useMemo } from "react";
import { currentTrackedPrs } from "@/lib/analytics/repMax";
import { REP_MAX_CATEGORY_ORDER, formatDate } from "./chartUtils";
import type { LiftEntry } from "@/types/dashboard";

/**
 * One row per movement that has a current PR at a tracked rep-max scheme
 * (1/2/3/5RM), with a column per scheme — a quick-reference summary so an
 * athlete doesn't have to hunt through a dozen scatter charts to see where
 * their numbers currently stand.
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
    <div className="mb-4 overflow-x-auto">
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
  );
}
