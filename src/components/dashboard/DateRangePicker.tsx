import { useState } from "react";
import dayjs from "dayjs";
import { CalendarRange } from "lucide-react";
import type { DateRange as CalendarSelection } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "./charts/chartUtils";
import {
  computePresetRange,
  PRESET_OPTIONS,
  type DateRange,
  type DateRangePreset,
} from "@/lib/analytics/dateRange";
import { capture } from "@/lib/posthog";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  /** The uploaded log's own full span — bounds and disables the calendar. */
  dateBounds: DateRange;
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
}

function triggerLabel(preset: DateRangePreset, value: DateRange | null): string {
  if (preset !== "custom") {
    return PRESET_OPTIONS.find((p) => p.id === preset)?.label ?? "All time";
  }
  if (!value) return "Custom range";
  return `${formatDate(value.start.format("YYYY-MM-DD"))} – ${formatDate(value.end.format("YYYY-MM-DD"))}`;
}

/**
 * Filters every chart to a date window within the uploaded log. Presets are
 * anchored to today's real-world date (not the log's own last entry), so an
 * older export can legitimately show an empty "last 3 months" window — the
 * same way any dashboard reading from a stale data source would.
 */
export function DateRangePicker({ dateBounds, value, onChange }: DateRangePickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>("all_time");
  const [open, setOpen] = useState(false);

  const selectPreset = (id: Exclude<DateRangePreset, "custom">) => {
    setPreset(id);
    onChange(computePresetRange(id, dayjs()));
    capture({ name: "date_range_changed", props: { preset: id } });
    setOpen(false);
  };

  const selectCustom = (selection: CalendarSelection | undefined) => {
    if (!selection?.from || !selection.to) return;
    setPreset("custom");
    onChange({ start: dayjs(selection.from).startOf("day"), end: dayjs(selection.to).endOf("day") });
    capture({ name: "date_range_changed", props: { preset: "custom" } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <CalendarRange className="size-3.5" aria-hidden="true" />
          <span>{triggerLabel(preset, value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-1 border-b border-border p-2 sm:w-40 sm:border-r sm:border-b-0">
            {PRESET_OPTIONS.map((option) => (
              <Button
                key={option.id}
                variant="ghost"
                size="sm"
                onClick={() => selectPreset(option.id)}
                className={cn(
                  "justify-start",
                  preset === option.id && "bg-accent-subtle text-accent-link"
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={
              preset === "custom" && value
                ? { from: value.start.toDate(), to: value.end.toDate() }
                : undefined
            }
            onSelect={selectCustom}
            defaultMonth={dateBounds.end.toDate()}
            startMonth={dateBounds.start.toDate()}
            endMonth={dateBounds.end.toDate()}
            disabled={[{ before: dateBounds.start.toDate() }, { after: dateBounds.end.toDate() }]}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
