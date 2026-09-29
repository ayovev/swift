import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBodyCompNoiseBands } from "@/lib/analytics/bodyCompNoise";
import {
  compareWindows,
  defaultWindowA,
  windowAIsContiguous,
  windowsToExperimentFields,
} from "@/lib/analytics/compareWindows";
import { capture } from "@/lib/posthog";
import type { BodyCompComparison, DateWindow, PerformanceComparison } from "@/types/compare";
import type { ExperimentFields } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";
import { formatDate } from "./charts/chartUtils";

interface CompareTabProps {
  workouts: SugarWodRow[];
  /** Empty when no InBody file is loaded — body composition then reports why it can't be compared. */
  scans: InBodyRow[];
  tags: ContextTag[];
  /** Window B from a drag on a chart, if that's how the athlete got here. */
  initialWindowB: DateWindow | null;
  onSaveAsExperiment: (fields: ExperimentFields) => void;
}

const today = () => dayjs().format("YYYY-MM-DD");

function defaultWindowB(): DateWindow {
  const end = dayjs();
  return { start: end.subtract(89, "day").format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") };
}

const signed = (n: number, decimals: number) => `${n > 0 ? "+" : ""}${n.toFixed(decimals)}`;

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value} max={today()} onChange={(e) => onChange(e.target.value)} className="h-9 w-44" />
    </div>
  );
}

function performanceCells(p: PerformanceComparison) {
  const decimals = p.valueKind === "raw" && (p.before ?? 0) < 20 ? 2 : 0;
  if (!p.comparable) {
    return (
      <TableCell colSpan={3} className="whitespace-normal text-xs text-muted-foreground">
        {p.reason}
      </TableCell>
    );
  }
  const pct = p.pctChange ?? 0;
  return (
    <>
      <TableCell className="tabular">{p.before!.toFixed(decimals)}</TableCell>
      <TableCell className="tabular">{p.after!.toFixed(decimals)}</TableCell>
      <TableCell className="whitespace-normal text-sm">
        {p.direction === "flat" ? "About the same" : p.direction === "up" ? "Better" : "Worse"}{" "}
        <span className="tabular text-xs text-muted-foreground">
          ({signed(pct * 100, 0)}%{p.valueKind === "estimated_1rm" ? ", estimated 1RM" : ""})
        </span>
      </TableCell>
    </>
  );
}

function bodyCells(m: BodyCompComparison) {
  if (m.delta === null) {
    return (
      <TableCell colSpan={3} className="whitespace-normal text-xs text-muted-foreground">
        {m.reason}
      </TableCell>
    );
  }
  const unit = m.unit === "%" ? "%" : " lb";
  return (
    <>
      <TableCell className="tabular">{m.before!.toFixed(1)}</TableCell>
      <TableCell className="tabular">{m.after!.toFixed(1)}</TableCell>
      <TableCell className="whitespace-normal text-sm">
        <span className="tabular">
          {signed(m.delta, 1)}
          {unit}
        </span>{" "}
        <span className="text-xs text-muted-foreground">{m.meaningful ? "" : "within normal scan variation"}</span>
      </TableCell>
    </>
  );
}

/**
 * Pick a range, see what changed. Window B is the range being looked at
 * (dragged out on a chart, or typed here) and window A defaults to the
 * equal-length stretch right before it; either can be edited. A comparison
 * can be saved as an Experiment, which is the same record the Experiments
 * view holds — there is no second model.
 */
export function CompareTab({ workouts, scans, tags, initialWindowB, onSaveAsExperiment }: CompareTabProps) {
  const [b, setB] = useState<DateWindow>(initialWindowB ?? defaultWindowB());
  const [customA, setCustomA] = useState<DateWindow | null>(null);
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState(false);

  const a = customA ?? defaultWindowA(b);
  const bands = useMemo(() => getBodyCompNoiseBands(scans), [scans]);
  const result = useMemo(
    () => compareWindows(workouts, scans, a, b, { noiseBands: bands, tags }),
    [workouts, scans, a, b, bands, tags]
  );

  const comparable = result.performance.filter((p) => p.comparable);
  const thin = result.performance.filter((p) => !p.comparable);

  const setBField = (field: keyof DateWindow, v: string) => {
    setSaved(false);
    setB((prev) => ({ ...prev, [field]: v }));
  };

  const windowsValid = b.start !== "" && b.end !== "" && b.end >= b.start;
  const suggested = windowsValid ? `${formatDate(b.start)} – ${formatDate(b.end)}` : "";

  const save = () => {
    onSaveAsExperiment({
      label: (label.trim() || `Comparison, ${suggested}`).slice(0, 200),
      ...windowsToExperimentFields(a, b),
    });
    capture({ name: "interaction_used", props: { interaction: "compare_saved_as_experiment" } });
    setSaved(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Compare a range against the stretch before it: lifts, named benchmarks and body
            composition. Drag across a chart to fill in the range, or type the dates here.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <DateField id="compare-b-start" label="Range starts" value={b.start} onChange={(v) => setBField("start", v)} />
            <DateField id="compare-b-end" label="Range ends" value={b.end} onChange={(v) => setBField("end", v)} />
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-sm">
              Compared with{" "}
              <span className="tabular font-medium">
                {formatDate(a.start)} – {formatDate(a.end)}
              </span>
              {customA ? "" : ", the same number of days immediately before"}.
            </p>
            {customA ? (
              <div className="flex flex-wrap items-end gap-4">
                <DateField id="compare-a-start" label="Earlier range starts" value={customA.start} onChange={(v) => setCustomA({ ...customA, start: v })} />
                <DateField id="compare-a-end" label="Earlier range ends" value={customA.end} onChange={(v) => setCustomA({ ...customA, end: v })} />
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setCustomA(null)}>
                  Use the days immediately before
                </Button>
              </div>
            ) : (
              <div>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setCustomA(defaultWindowA(b))}>
                  Choose the earlier range
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {result.status === "insufficient" ? (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <Badge variant="secondary" className="w-fit">
              Not enough data yet
            </Badge>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{result.reason}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {comparable.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                  No lift or named benchmark has enough entries in both ranges to compare.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lift or benchmark</TableHead>
                      <TableHead>Earlier</TableHead>
                      <TableHead>Range</TableHead>
                      <TableHead>Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparable.map((p) => (
                      <TableRow key={p.metric}>
                        <TableCell className="font-medium whitespace-normal">{p.metric}</TableCell>
                        {performanceCells(p)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {thin.length > 0 ? (
                <Collapsible className="border-t border-border px-6 py-3">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between text-left text-sm">
                    Not enough entries to compare ({thin.length})
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {thin.map((p) => (
                        <li key={p.metric} className="text-sm">
                          <span className="font-medium">{p.metric}</span>
                          <span className="text-muted-foreground">: {p.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Body composition</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Measurement</TableHead>
                    <TableHead>Earlier</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead>Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.bodyComp.map((m) => (
                    <TableRow key={m.metric}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      {bodyCells(m)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {result.caveats.length > 0 ? (
        <Card>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {result.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {windowsValid ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Save this range as an experiment to keep it on the Experiments view, compared with the
              earlier range shown above.{" "}
              {windowAIsContiguous(a, b)
                ? ""
                : "An experiment's earlier range always runs up to its start date, so it will also include the days between the two ranges here."}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="compare-experiment-label">Name</Label>
                <Input
                  id="compare-experiment-label"
                  value={label}
                  onChange={(e) => {
                    setSaved(false);
                    setLabel(e.target.value);
                  }}
                  placeholder={`Comparison, ${suggested}`}
                  maxLength={200}
                />
              </div>
              <Button type="button" size="sm" className="h-9" onClick={save} disabled={saved}>
                {saved ? "Saved as experiment" : "Save as experiment"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
