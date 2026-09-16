import { Button } from "@/components/ui/button";
import { GRANULARITY_OPTIONS, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";
import { cn } from "@/lib/utils";

interface GranularityPickerProps {
  value: Granularity;
  onChange: (granularity: Granularity) => void;
}

/**
 * How finely the trend charts bucket time. A segmented control rather than
 * DateRangePicker's popover — there's no custom sub-case here that needs a
 * panel of its own.
 */
export function GranularityPicker({ value, onChange }: GranularityPickerProps) {
  const select = (id: Granularity) => {
    if (id === value) return;
    onChange(id);
    capture({ name: "granularity_changed", props: { granularity: id } });
  };

  return (
    <div
      role="group"
      aria-label="Chart granularity"
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
    >
      {GRANULARITY_OPTIONS.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => select(option.id)}
          aria-pressed={value === option.id}
          className={cn(
            "h-7 px-2.5 text-xs",
            value === option.id && "bg-accent-subtle text-accent-link"
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
