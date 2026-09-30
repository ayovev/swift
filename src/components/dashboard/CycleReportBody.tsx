import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ATTRIBUTION_LABEL } from "./strengthLabels";
import type { CycleLiftChange, CycleReport } from "@/types/cycle";

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

/** A range's report: what it did to volume, lifts and (with scans) body composition, in plain words. */
export function CycleReportBody({ report }: { report: CycleReport }) {
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
