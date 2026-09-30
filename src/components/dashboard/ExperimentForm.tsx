import { useId, useState } from "react";
import dayjs from "dayjs";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "./charts/chartUtils";
import type { Experiment, ExperimentFields } from "@/types/experiment";

/** "YYYY-MM-DD" to a local-midnight Date, which is what the calendar picker works in. */
function isoToDate(iso: string | undefined): Date | undefined {
  return iso ? dayjs(iso).toDate() : undefined;
}

/**
 * The one form for adding an experiment and editing one. With `initial` it
 * starts filled in, keeps its values after submit (the caller closes it), and
 * offers Cancel; without, it's the add form and clears itself after submit.
 */
export function ExperimentForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Experiment;
  submitLabel: string;
  onSubmit: (fields: ExperimentFields) => void;
  onCancel?: () => void;
}) {
  const editing = initial !== undefined;
  const uid = useId();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [date, setDate] = useState<Date | undefined>(isoToDate(initial?.date));
  const [endDate, setEndDate] = useState<Date | undefined>(isoToDate(initial?.endDate));
  const [baselineStart, setBaselineStart] = useState<Date | undefined>(isoToDate(initial?.baselineStart));
  const [open, setOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);

  const canSubmit = label.trim() !== "" && date !== undefined;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !date) return;
    const iso = (d: Date) => dayjs(d).format("YYYY-MM-DD");
    onSubmit({
      label: label.trim(),
      date: iso(date),
      ...(endDate ? { endDate: iso(endDate) } : {}),
      ...(baselineStart ? { baselineStart: iso(baselineStart) } : {}),
    });
    if (!editing) {
      setLabel("");
      setDate(undefined);
      setEndDate(undefined);
      setBaselineStart(undefined);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-date`}>Started</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={`${uid}-date`}
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-48 justify-start gap-2 font-normal"
            >
              <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {date ? formatDate(dayjs(date).format("YYYY-MM-DD")) : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                setDate(d);
                setOpen(false);
                // A start date moved past the current end date would leave an
                // inverted range; clearing it is simpler than clamping, and
                // this is a rare edit (both fields default unset).
                if (d && endDate && dayjs(endDate).isBefore(dayjs(d), "day")) setEndDate(undefined);
                // Same for the earlier range: it has to start before the experiment does.
                if (d && baselineStart && !dayjs(baselineStart).isBefore(dayjs(d), "day")) setBaselineStart(undefined);
              }}
              disabled={{ after: new Date() }}
              defaultMonth={date ?? new Date()}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-end-date`}>Ended (optional)</Label>
        <div className="flex items-center gap-1">
          <Popover open={endOpen} onOpenChange={setEndOpen}>
            <PopoverTrigger asChild>
              <Button
                id={`${uid}-end-date`}
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-48 justify-start gap-2 font-normal"
              >
                <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {endDate ? formatDate(dayjs(endDate).format("YYYY-MM-DD")) : "Still ongoing"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(d) => {
                  setEndDate(d);
                  setEndOpen(false);
                }}
                disabled={{ before: date ?? new Date(0), after: new Date() }}
                defaultMonth={endDate ?? date ?? new Date()}
              />
            </PopoverContent>
          </Popover>
          {endDate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 font-normal"
              onClick={() => setEndDate(undefined)}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-baseline`}>Compare against (optional)</Label>
        <div className="flex items-center gap-1">
          <Popover open={baselineOpen} onOpenChange={setBaselineOpen}>
            <PopoverTrigger asChild>
              <Button
                id={`${uid}-baseline`}
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-48 justify-start gap-2 font-normal"
              >
                <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {baselineStart ? `From ${formatDate(dayjs(baselineStart).format("YYYY-MM-DD"))}` : "All earlier history"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={baselineStart}
                onSelect={(d) => {
                  setBaselineStart(d);
                  setBaselineOpen(false);
                }}
                disabled={{ after: date ? dayjs(date).subtract(1, "day").toDate() : new Date() }}
                defaultMonth={baselineStart ?? date ?? new Date()}
              />
            </PopoverContent>
          </Popover>
          {baselineStart ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 font-normal"
              onClick={() => setBaselineStart(undefined)}
            >
              All history
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={`${uid}-label`}>What did you try?</Label>
        <Input
          id={`${uid}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Started 5/3/1 cycle"
          maxLength={200}
        />
      </div>

      <Button type="submit" size="sm" disabled={!canSubmit} className="h-9">
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </form>
  );
}
