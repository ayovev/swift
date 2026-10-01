import { useState } from "react";
import dayjs from "dayjs";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "./charts/chartUtils";
import { cn } from "@/lib/utils";

const ISO = "YYYY-MM-DD";

interface DatePickerFieldProps {
  /** Id of the trigger, so a `<Label htmlFor>` names it. */
  id: string;
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest / latest pickable day, "YYYY-MM-DD". */
  min?: string | undefined;
  max?: string | undefined;
  disabled?: boolean;
  /** Shown when empty. */
  placeholder?: string;
  /** Adds a Clear button for a date that is optional. */
  clearable?: boolean;
  "aria-describedby"?: string;
}

/**
 * Single-date counterpart of `DateRangePicker`: the same popover and `Calendar`,
 * replacing the browser's native `<input type="date">`, whose picker can't be
 * themed and looks different in every browser. The value stays an ISO string,
 * the shape every user-authored date is stored in.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder = "Select date",
  clearable,
  "aria-describedby": describedBy,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? dayjs(value, ISO).toDate() : undefined;
  const minDate = min ? dayjs(min, ISO).toDate() : undefined;
  const maxDate = max ? dayjs(max, ISO).toDate() : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-describedby={describedBy}
          className={cn("h-9 w-44 justify-start gap-2 font-normal", !value && "text-muted-foreground")}
        >
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span>{value ? formatDate(value) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (!day) return;
            onChange(dayjs(day).format(ISO));
            setOpen(false);
          }}
          defaultMonth={selected ?? maxDate ?? new Date()}
          disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
        />
        {clearable && value ? (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
