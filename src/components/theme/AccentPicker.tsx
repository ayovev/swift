import { useState } from "react";
import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { capture } from "@/lib/posthog";
import { formatOklch } from "@/lib/theme/contrast";
import { ACCENT_SWATCHES, accentRoles, getSwatch } from "@/lib/theme/palette";
import { useTheme } from "@/lib/theme/useTheme";
import { cn } from "@/lib/utils";

/**
 * A curated set of accent swatches — deliberately not a free colour picker
 * (see palette.ts): every swatch is contrast-tested against both modes
 * (tests/themeContrast.test.ts), which an arbitrary hex value would not be.
 *
 * The trigger previews the current accent itself rather than a generic
 * palette icon, and picking a new one expands a tight row of swatches right
 * next to it instead of opening a separate settings-style panel.
 */
export function AccentPicker() {
  const [open, setOpen] = useState(false);
  const { accent, setAccent, resolvedMode } = useTheme();
  const current = accentRoles(getSwatch(accent), resolvedMode);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Accent colour: ${getSwatch(accent).name}`}
          className={cn(
            "size-6 shrink-0 rounded-full border border-border transition-transform",
            "hover:scale-105",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          )}
          style={{ backgroundColor: formatOklch(current.primary) }}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
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
                  setOpen(false);
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
  );
}
