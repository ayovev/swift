import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type ChevronProps, type DayButtonProps } from "react-day-picker"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function CalendarChevron({ orientation, className, disabled: _disabled, ...props }: ChevronProps) {
  const Icon = orientation === "left" ? ChevronLeft : ChevronRight
  return <Icon className={cn("size-4", className)} {...props} />
}

function CalendarDayButton({ className, day: _day, modifiers, ...props }: DayButtonProps) {
  return (
    <button
      type="button"
      data-selected={modifiers.selected || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      data-today={modifiers.today || undefined}
      className={cn(
        "flex size-8 items-center justify-center rounded-md p-0 text-sm font-normal transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-40",
        "data-[today]:font-semibold data-[today]:text-accent-link",
        "data-[range-middle]:rounded-none data-[range-middle]:bg-accent-subtle data-[range-middle]:text-accent-link",
        "data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary",
        "data-[range-start]:rounded-r-none data-[range-end]:rounded-l-none",
        className
      )}
      {...props}
    />
  )
}

/**
 * Thin Tailwind wrapper around react-day-picker — no default rdp stylesheet
 * is imported, so every visual state is driven by `classNames` here instead.
 * Selected/range colouring uses `--primary` (the athlete's accent), matching
 * how AccentPicker and TabNav mark an active selection.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-3",
        nav: "flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "absolute left-1 top-1 z-10"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "absolute right-1 top-1 z-10"
        ),
        month_caption: "flex h-8 items-center justify-center text-sm font-medium",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-center text-xs font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "p-0 text-center",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  )
}

export { Calendar }
