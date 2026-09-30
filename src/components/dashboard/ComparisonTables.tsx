import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BodyCompComparison, PerformanceComparison, WindowComparison } from "@/types/compare";

const signed = (n: number, decimals: number) => `${n > 0 ? "+" : ""}${n.toFixed(decimals)}`;

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
 * The two tables of a window comparison (performance, then body composition),
 * or the reason there is nothing to compare, followed by any caveats. Renders
 * whatever `compareWindows` returned; it computes nothing itself.
 */
export function ComparisonTables({ result }: { result: WindowComparison }) {
  const comparable = result.performance.filter((p) => p.comparable);
  const thin = result.performance.filter((p) => !p.comparable);

  return (
    <>
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
    </>
  );
}
