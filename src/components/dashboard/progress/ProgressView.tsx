import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { readingsFromInBody, weightBandLb } from "@/lib/analytics/insights/bodyReadings";
import { coverageParagraph, displayName, longDate, noHeadlineText } from "@/lib/analytics/insights/display";
import { classifySubjects, headlineSentence, type ProgressGroup, type ProgressRow } from "@/lib/analytics/insights/headline";
import { filterRowsByPeriod, periodRange, type PeriodPreset } from "@/lib/analytics/insights/period";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import { pooledReadings, pooledScanRows } from "@/lib/analytics/weighIns";
import type { WeighIn } from "@/types/weighIn";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import { PeriodFilter } from "./PeriodFilter";
import { ProgressRowItem } from "./ProgressRowItem";
import { changeScale } from "./ChangeBar";

const GROUPS: { id: ProgressGroup; title: string; open: boolean }[] = [
  { id: "up", title: "Up", open: true },
  { id: "down", title: "Down", open: true },
  { id: "not-tested-since", title: "Not tested since", open: true },
  { id: "no-clear-change", title: "No clear change", open: false },
  { id: "few", title: "Fewer than 6 sessions", open: false },
  { id: "not-recent", title: "Not recent", open: false },
];

interface ProgressViewProps {
  workouts: readonly SugarWodRow[];
  scans: readonly InBodyRow[];
  /** Manual weigh-ins, pooled with the scans for the body-context lines. */
  weighIns?: readonly WeighIn[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
  /** Opens a subject on the Timeline (the link under an opened row's chart). */
  onSeeOnTimeline?: (subjectKey: string) => void;
  /** A subject to open and scroll to, when Progress is reached from Overview's "What moved". */
  focusSubjectKey?: string | null;
}

/**
 * The Insights front door: the headline (a label and the counts behind it), the "Logged in" filter, and every lift and benchmark in one
 * of six groups. It reads the whole unfiltered log as of today; the filter only chooses which subjects are listed.
 */
export function ProgressView({ workouts, scans, weighIns = [], asOf, onSeeOnTimeline, focusSubjectKey = null }: ProgressViewProps) {
  const today = useMemo(() => asOf ?? dayjs().format("YYYY-MM-DD"), [asOf]);
  const { subjects, unused } = useMemo(() => buildProgressSubjects(workouts), [workouts]);
  const { rows, headline } = useMemo(() => classifySubjects(subjects, today), [subjects, today]);
  // One scale for every row's change bar, from all verdicts rather than the filtered list, so filtering never rescales the bars.
  const scale = useMemo(() => changeScale(rows), [rows]);
  const readings = useMemo(() => pooledReadings(readingsFromInBody(scans), weighIns), [scans, weighIns]);
  const band = useMemo(() => weightBandLb(pooledScanRows(scans, weighIns)), [scans, weighIns]);
  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [custom, setCustom] = useState({ start: "", end: today });

  const range = periodRange(preset, today, custom);
  const listed = useMemo(() => filterRowsByPeriod(rows, range), [rows, range]);
  const twins = useMemo(() => {
    const map = new Map<string, (typeof subjects)[number]>();
    for (const s of subjects) {
      const other = subjects.find((o) => o.kind === s.kind && o.movement === s.movement && o.status !== s.status);
      if (other) map.set(s.key, other);
    }
    return map;
  }, [subjects]);

  // The date of the latest workout of any kind in the log, so the athlete can see how current the data is.
  const latestInLog = useMemo(() => {
    let max = "";
    for (const w of workouts) {
      const d = parseWorkoutDate(w.date);
      if (d.isValid()) {
        const iso = d.format("YYYY-MM-DD");
        if (iso > max && iso <= today) max = iso;
      }
    }
    return max;
  }, [workouts, today]);

  if (subjects.length === 0) {
    return <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No lift or benchmark has been logged yet.</p>;
  }

  const allNotRecent = rows.every((r) => r.group === "not-recent");
  const moved = listed.some((r) => r.group === "up" || r.group === "down");

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Headline" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        {allNotRecent ? (
          <p className="text-sm">No lift or benchmark was logged in the last 12 months.</p>
        ) : headline.label ? (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-lg font-semibold text-accent-link">{headline.label}</span>
            <span className="text-sm">{headlineSentence(headline.label, headline.up, headline.down, headline.noClearChange)}</span>
          </p>
        ) : (
          <p className="text-sm">{noHeadlineText(headline)}</p>
        )}
        <p className="text-sm text-muted-foreground">{coverageParagraph(headline, latestInLog)}</p>
        <HowCounted rows={rows} unused={unused} asOfLog={latestInLog} />
      </section>

      <PeriodFilter
        preset={preset}
        onPreset={setPreset}
        custom={custom}
        onCustom={setCustom}
        invalid={range === "invalid"}
        showing={range === null ? null : `Showing ${listed.length} of ${rows.length} subjects.`}
      />

      <div className="flex flex-col gap-3">
        {range !== null && listed.length === 0 ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No lift or benchmark was logged in this period.</p> : null}
        {listed.length > 0 && !moved ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No lift or benchmark has moved clearly.</p> : null}
        {GROUPS.map((g) => {
          const items = listed.filter((r) => r.group === g.id);
          if (items.length === 0) return null;
          const list = (
            <ul>
              {items.map((r) => (
                <ProgressRowItem key={r.subject.key} row={r} twin={twins.get(r.subject.key) ?? null} readings={readings} bandLb={band} focused={r.subject.key === focusSubjectKey} scale={scale} {...(onSeeOnTimeline ? { onSeeOnTimeline } : {})} />
              ))}
            </ul>
          );
          return g.open ? (
            <section key={g.id} aria-label={g.title} className="overflow-hidden rounded-lg border border-border bg-card">
              <h2 className="flex items-baseline justify-between px-4 py-2.5 text-sm font-semibold">
                {g.title}
                <span className="font-mono text-xs font-normal text-muted-foreground">{items.length}</span>
              </h2>
              {list}
            </section>
          ) : (
            <Collapsible key={g.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold">
                <span>{g.title}</span>
                <span className="flex items-center gap-2 font-mono text-xs font-normal text-muted-foreground">
                  {items.length}
                  <ChevronDown className="size-4" aria-hidden />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>{list}</CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

function HowCounted({ rows, unused, asOfLog }: { rows: ProgressRow[]; unused: ReturnType<typeof buildProgressSubjects>["unused"]; asOfLog: string }) {
  const counted = rows.filter((r) => r.group === "up" || r.group === "down" || r.group === "no-clear-change");
  const leftOut = rows.filter((r) => r.group === "few" || r.group === "not-recent" || r.group === "not-tested-since");
  const unusedCount = unused.loadRows - unused.used;
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-sm text-accent-link underline underline-offset-2">How this was counted</CollapsibleTrigger>
      <CollapsibleContent className="mt-2 flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          Counted ({counted.length}): {counted.map((r) => `${displayName(r.subject)} (${r.group === "no-clear-change" ? "no clear change" : r.group})`).join(", ") || "none"}.
        </p>
        {leftOut.length ? (
          <p>
            Left out ({leftOut.length}): {leftOut.map((r) => displayName(r.subject)).join(", ")}.
          </p>
        ) : null}
        <p>
          {unusedCount} of {unused.loadRows} weight entries weren't used: {unused.noScheme} no readable rep scheme, {unused.outsideRange} outside 1 to 8 reps, {unused.noLiftNamed} no lift named.
        </p>
        <p>As of {longDate(asOfLog)}.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
