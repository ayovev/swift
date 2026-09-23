import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  /** Shown in a popover on hover/focus of a disabled option — explains *why* it's unavailable. */
  title?: string;
}

/**
 * The active-item accent classes, shared with ThemeControls' mode buttons
 * (which hand-render for icon support but are otherwise the same control
 * family).
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
    <TooltipProvider>
      <div
        role="group"
        aria-label={ariaLabel}
        className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
      >
        {options.map((option) => {
          const button = (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={option.disabled}
              onClick={() => onChange(option.id)}
              aria-pressed={value === option.id}
              className={cn("h-7 px-2.5 text-xs", value === option.id && ACTIVE_SEGMENT_CLASSES)}
            >
              {option.label}
            </Button>
          );

          if (!option.disabled || !option.title) {
            return <span key={option.id}>{button}</span>;
          }

          return (
            <Tooltip key={option.id}>
              {/* A disabled <button> is pointer-events-none and never focusable, so it
                  can't be the tooltip trigger itself — the tabIndex'd wrapper span is. */}
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex rounded-md">
                  {button}
                </span>
              </TooltipTrigger>
              <TooltipContent>{option.title}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
