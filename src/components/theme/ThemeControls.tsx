import { useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACTIVE_SEGMENT_CLASSES } from "@/components/dashboard/SegmentedControl";
import { capture } from "@/lib/posthog";
import { formatOklch } from "@/lib/theme/contrast";
import { ACCENT_SWATCHES, accentRoles, getSwatch } from "@/lib/theme/palette";
import { useTheme, type ModePreference } from "@/lib/theme/useTheme";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: { value: ModePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Accent colour and light/dark/system mode, folded into one bordered pill.
 * They're always shown side by side (Landing's and Dashboard's headers), so
 * one shared container reads as "theme controls," not two adjacent widgets —
 * a thin divider is what separates the two pieces of functionality, not a
 * gap between two boxes.
 *
 * The accent swatch is deliberately not a free colour picker (see
 * palette.ts): every swatch is contrast-tested against both modes
 * (tests/themeContrast.test.ts), which an arbitrary hex value would not be.
 */
export function ThemeControls() {
  const [accentOpen, setAccentOpen] = useState(false);
  const { accent, setAccent, mode, setMode, resolvedMode } = useTheme();
  const current = accentRoles(getSwatch(accent), resolvedMode);

  return (
    <div className="flex items-center rounded-md border border-border p-0.5">
      <Popover open={accentOpen} onOpenChange={setAccentOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Accent colour: ${getSwatch(accent).name}`}
            className="h-7 w-8 px-0"
          >
            <span
              className="size-3.5 rounded-full border border-border"
              style={{ backgroundColor: formatOklch(current.primary) }}
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-auto rounded-full border border-border bg-popover p-1 shadow-md"
        >
          <div role="radiogroup" aria-label="Accent colour" className="flex items-center gap-1">
            {ACCENT_SWATCHES.map((swatch) => {
              const active = swatch.id === accent;
              // Preview each swatch as it will actually render in this mode.
              const { primary, primaryForeground } = accentRoles(swatch, resolvedMode);
              return (
                <button
                  key={swatch.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={swatch.name}
                  title={swatch.name}
                  onClick={() => {
                    setAccent(swatch.id);
                    capture({ name: "theme_changed", props: { accent: swatch.id } });
                    setAccentOpen(false);
                  }}
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full transition-transform",
                    "hover:scale-110",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active && "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
                  )}
                  style={{ backgroundColor: formatOklch(primary) }}
                >
                  {active ? (
                    <Check
                      className="size-2.5"
                      style={{ color: formatOklch(primaryForeground) }}
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/*
        The button's own padding around the swatch is symmetric (9px), but
        the flat gap-1.5 that used to sit on both sides of this divider made
        the right side read as more padded — the eye compares distance to
        the *next visual landmark*, and the divider was one extra gap away
        on the right versus the pill's plain border on the left. ml-[3px]
        brings that total back to 12px on both sides; mr-1.5 keeps the
        divider-to-mode-buttons gap as it was.
      */}
      <div className="ml-[3px] mr-1.5 h-4 w-px bg-border" aria-hidden="true" />

      <div role="radiogroup" aria-label="Colour mode" className="flex items-center gap-0.5">
        {MODE_OPTIONS.map(({ value, label, Icon }) => {
          const active = mode === value;
          return (
            <Button
              key={value}
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode(value);
                capture({ name: "theme_changed", props: { mode: value } });
              }}
              className={cn("h-7 w-8 px-0", active && ACTIVE_SEGMENT_CLASSES)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
