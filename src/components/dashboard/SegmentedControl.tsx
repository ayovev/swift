import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  id: T;
  label: string;
}

/**
 * The active-item accent classes, shared with ModeToggle (which hand-renders
 * its own buttons for icon support but is otherwise the same control family).
 * The ghost Button variant's own hover is two separate rules — plain
 * hover:bg-accent and a differently-opacity'd dark:hover:bg-accent/50 — so
 * both have to be pinned here or the active item only keeps its accent tint
 * on hover in whichever mode this doesn't override.
 */
export const ACTIVE_SEGMENT_CLASSES =
  "bg-accent-subtle text-accent-link hover:bg-accent-subtle hover:text-accent-link dark:hover:bg-accent-subtle dark:hover:text-accent-link";

/**
 * A bordered row of ghost buttons, active option in the accent — the same
 * shape as GranularityPicker, extracted so every segmented control in the
 * dashboard (granularity, rep-max filter, color mode) reads as one control
 * family instead of each picking its own look.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
    >
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={cn("h-7 px-2.5 text-xs", value === option.id && ACTIVE_SEGMENT_CLASSES)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
