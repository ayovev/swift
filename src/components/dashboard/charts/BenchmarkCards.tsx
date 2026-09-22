import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "./chartUtils";
import type { BenchmarkEntry } from "@/types/dashboard";

/** Seconds -> "3:45". Benchmark scores are stored as raw seconds. */
function formatScore(entry: BenchmarkEntry): string {
  if (entry.display) return entry.display;
  if (entry.value === null) return "—";
  const mins = Math.floor(entry.value / 60);
  const secs = Math.round(entry.value % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function BenchmarkCard({ name, entries }: { name: string; entries: BenchmarkEntry[] }) {
  // Oldest first, so the card reads as a history.
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-2 text-base">
          <span>{name}</span>
          <span className="text-xs font-normal text-muted-foreground tabular">
            {ordered.length}×
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {ordered.map((entry, i) => (
            <li
              key={`${entry.date}-${i}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-muted-foreground">{formatDate(entry.date)}</span>
              <span className="flex items-center gap-2">
                {entry.pr ? (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]/[1]">
                    PR
                  </Badge>
                ) : null}
                {entry.rx ? (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {entry.rx.toLowerCase()}
                  </span>
                ) : null}
                <span className="font-medium tabular">{formatScore(entry)}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Named benchmark history. */
export function BenchmarkCards({ benchmarks }: { benchmarks: Record<string, BenchmarkEntry[]> }) {
  const names = Object.keys(benchmarks).sort();

  if (names.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No named benchmarks (Fran, Grace, Murph and friends) appear more than once in this export,
        so there's no history to compare yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {names.map((name) => {
        const entries = benchmarks[name];
        return entries ? <BenchmarkCard key={name} name={name} entries={entries} /> : null;
      })}
    </div>
  );
}
