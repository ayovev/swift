import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBodyCompNoiseBands } from "@/lib/analytics/bodyCompNoise";
import { customCycle, getCycleReport, getCycles } from "@/lib/analytics/cycleReport";
import type { StrengthAttribution } from "@/lib/analytics/relativeStrength";
import type { CycleLiftChange, CycleReport } from "@/types/cycle";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";
import { formatDate } from "./charts/chartUtils";

interface CyclesTabProps {
  workouts: SugarWodRow[];
  /** Empty when no InBody file is loaded; cycles still report volume and lifts. */
  scans: InBodyRow[];
  tags: ContextTag[];
}

const ATTRIBUTION_LABEL: Record<StrengthAttribution, string> = {
  "strength-driven": "Strength",
  "mass-driven": "Mass",
  mixed: "Strength and mass",
  flat: "Flat",
  declined: "Down",
};

const signedPct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

function LiftRows({ changes }: { changes: CycleLiftChange[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lift</TableHead>
          <TableHead>Sessions</TableHead>
          <TableHead>Estimated 1RM</TableHead>
          <TableHead>Change</TableHead>
          <TableHead>Attribution</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((c) => (
          <TableRow key={`${c.lift}:${c.rxStatus}`}>
            <TableCell className="font-medium whitespace-normal">
              {c.lift} ({c.rxStatus}){c.focus ? <span className="ml-2 text-xs text-muted-foreground">focus</span> : null}
            </TableCell>
            <TableCell className="tabular">{c.sessions}</TableCell>
            <TableCell className="tabular">
              {Math.round(c.startE1rm)} to {Math.round(c.endE1rm)}
            </TableCell>
            <TableCell className="tabular">{signedPct(c.pctChange)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {c.attribution ? ATTRIBUTION_LABEL[c.attribution] : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReportBody({ report }: { report: CycleReport }) {
  if (report.status === "insufficient") {
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="secondary" className="w-fit">
          Not enough data yet
        </Badge>
        <p className="text-sm text-muted-foreground">{report.reason}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-sm leading-relaxed">{report.summary}</p>
      {report.tagNotes?.map((note) => (
        <p key={note} className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {note}
        </p>
      ))}
      {report.e1rmChanges.length > 0 ? <LiftRows changes={report.e1rmChanges} /> : null}
    </div>
  );
}

/**
 * A retrospective per training block. Blocks come from tags of type bulk,
 * cut, maintain or other (see the Tags view), or from a range typed in
 * below; automatic detection of blocks is not built. Volume and lift
 * changes work without an InBody file; body composition needs one.
 */
export function CyclesTab({ workouts, scans, tags }: CyclesTabProps) {
  const bands = useMemo(() => getBodyCompNoiseBands(scans), [scans]);
  const reports = useMemo(
    () =>
      getCycles(workouts, tags, { asOfDate: new Date() })
        .map((cycle) => getCycleReport(cycle, workouts, scans, { noiseBands: bands, tags }))
        .reverse(),
    [workouts, scans, tags, bands]
  );

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const custom = useMemo(
    () =>
      start && end
        ? getCycleReport(customCycle(workouts, start, end), workouts, scans, { noiseBands: bands, tags })
        : null,
    [start, end, workouts, scans, bands, tags]
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            What each training block did to your lifts and, with an InBody file loaded, your body
            composition. Blocks come from tags of type bulk, cut, maintain or other on the Tags view;
            you can also pick a range below.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycle-start">Range starts</Label>
              <Input id="cycle-start" type="date" value={start} max={today} onChange={(e) => setStart(e.target.value)} className="h-9 w-44" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycle-end">Range ends</Label>
              <Input id="cycle-end" type="date" value={end} max={today} onChange={(e) => setEnd(e.target.value)} className="h-9 w-44" />
            </div>
          </div>
          {custom ? (
            <div className="border-t border-border pt-4">
              <ReportBody report={custom} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No blocks yet. Tag a bulk, cut or maintain phase on the Tags view to see it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        reports.map((report) => (
          <Card key={report.cycle.tagId ?? `${report.cycle.start}:${report.cycle.end}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{report.cycle.label}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {formatDate(report.cycle.start)} – {formatDate(report.cycle.end)}
                {report.cycle.focusLifts.length > 0 ? ` · Focus: ${report.cycle.focusLifts.join(", ")}` : ""}
              </p>
            </CardHeader>
            <CardContent>
              <ReportBody report={report} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
