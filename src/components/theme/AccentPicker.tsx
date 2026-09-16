import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { capture } from "@/lib/posthog";
import { formatOklch } from "@/lib/theme/contrast";
import { ACCENT_SWATCHES, accentRoles } from "@/lib/theme/palette";
import { useTheme } from "@/lib/theme/useTheme";
import { cn } from "@/lib/utils";

/**
 * A curated set of accent swatches (FR-8.2). Deliberately not a free colour
 * picker for v1 — every swatch here is contrast-tested against both modes
 * (tests/themeContrast.test.ts), which an arbitrary hex value would not be.
 */
export function AccentPicker() {
  const { accent, setAccent, resolvedMode } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2" aria-label="Accent colour">
          <Palette className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Colour</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Accent colour
        </DropdownMenuLabel>
        <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-4 gap-1 p-1">
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
                }}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md transition-transform",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "hover:scale-105",
                  active && "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
                )}
                style={{ backgroundColor: formatOklch(primary) }}
              >
                {active ? (
                  <Check
                    className="size-3.5"
                    style={{ color: formatOklch(primaryForeground) }}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
