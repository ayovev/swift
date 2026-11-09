import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BodyReading } from "@/lib/analytics/insights/bodyContext";
import { bodyWeightRows, validateWeighIn } from "@/lib/analytics/weighIns";
import { capture } from "@/lib/posthog";
import { WEIGH_IN_NOTE_MAX, type WeighIn } from "@/types/weighIn";

interface WeighInsPanelProps {
  /** InBody scan weights, shown read-only in the same list. */
  scans: readonly BodyReading[];
  weighIns: readonly WeighIn[];
  onSave: (weighIn: WeighIn) => void;
  onDelete: (date: string) => void;
  /** YYYY-MM-DD; today unless a test says otherwise. */
  today?: string;
}

const SHOWN = 12;

const longDate = (iso: string): string => dayjs(iso).format("MMM D, YYYY");

/**
 * Body weight the athlete types in. One per day: saving a date that has one replaces it. Weigh-ins pool with InBody scans into one
 * series for the body-context lines on Progress; on a day with both, the scan is used and the weigh-in is kept and listed as not used.
 * The list shows scans (read-only) and weigh-ins together, newest first.
 */
export function WeighInsPanel({ scans, weighIns, onSave, onDelete, today }: WeighInsPanelProps) {
  const todayIso = useMemo(() => today ?? dayjs().format("YYYY-MM-DD"), [today]);
  const [date, setDate] = useState(todayIso);
  // null = untouched: the field shows the most recent weight (scan or weigh-in) as a starting point to adjust.
  const [typedWeight, setWeight] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => bodyWeightRows(scans, weighIns), [scans, weighIns]);
  const weight = typedWeight ?? (rows[0] ? String(rows[0].weightLb) : "");
  const shown = all ? rows : rows.slice(0, SHOWN);

  const save = () => {
    const result = validateWeighIn({ date, weightLb: weight.trim() === "" ? null : Number(weight), notes: note }, todayIso);
    if (result.status === "invalid") {
      setErrors(result.reasons);
      return;
    }
    setErrors([]);
    onSave(result.value);
    capture({ name: "interaction_used", props: { interaction: "weigh_in_saved" } });
    setWeight(null);
    setNote("");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Weigh-ins</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Type in your weight whenever you weigh yourself, one per day. Weigh-ins sit beside your InBody scans and feed the body-weight lines on Progress. On a day with a
          scan, the scan is used.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Weight (lb)
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex min-w-48 grow flex-col gap-1 text-xs text-muted-foreground">
            Note (optional, up to {WEIGH_IN_NOTE_MAX} characters)
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <Button type="submit" size="sm" className="h-9">
            Save weigh-in
          </Button>
        </form>
        {errors.length ? (
          <ul className="flex flex-col gap-1" role="alert">
            {errors.map((e) => (
              <li key={e} className="text-sm text-destructive">
                {e}
              </li>
            ))}
          </ul>
        ) : null}
        {rows.length ? (
          <ul className="flex flex-col">
            {shown.map((r) => (
              <li key={`${r.kind}:${r.date}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border py-2 first:border-t-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">
                    <span className="tabular">{longDate(r.date)}</span>
                    <span className="ml-3 tabular font-medium">{r.weightLb} lb</span>
                    <span className="ml-3 text-xs text-muted-foreground">{r.kind === "scan" ? "InBody scan" : "Entered"}</span>
                  </span>
                  {r.notes ? <span className="text-xs text-muted-foreground">{r.notes}</span> : null}
                  {!r.used ? <span className="text-xs text-muted-foreground">Not used: an InBody scan the same day</span> : null}
                </div>
                {r.kind === "entered" ? (
                  <div className="flex gap-3 text-sm">
                    <button
                      type="button"
                      className="text-accent-link underline underline-offset-2"
                      onClick={() => {
                        setDate(r.date);
                        setWeight(String(r.weightLb));
                        setNote(r.notes ?? "");
                        setErrors([]);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-destructive underline underline-offset-2"
                      onClick={() => {
                        onDelete(r.date);
                        capture({ name: "interaction_used", props: { interaction: "weigh_in_deleted" } });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No weigh-ins or scans yet.</p>
        )}
        {rows.length > SHOWN ? (
          <button type="button" className="self-start text-sm text-accent-link underline underline-offset-2" onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : `Show all ${rows.length}`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}
