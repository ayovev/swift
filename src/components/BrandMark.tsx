import { useBrand } from "@/lib/brand/brandStore";
import { plateFor } from "@/lib/brand/image";
import { useTheme } from "@/lib/theme/useTheme";
import { cn } from "@/lib/utils";

/**
 * The coach's gym logo, beside the Swift mark. Renders nothing without a logo.
 * The Swift mark is always drawn by its own component and is not removable;
 * this only adds to it.
 *
 * A see-through logo the page would swallow (a white logo in light mode, a black
 * one in dark mode) sits on a small plate. The plate colors are fixed, not
 * theme tokens: a plate exists to be the opposite of the logo.
 */
export function BrandMark({ className }: { className?: string }) {
  const { logo, name, tone } = useBrand();
  const { resolvedMode } = useTheme();
  if (!logo) return null;
  const plate = plateFor(tone, resolvedMode);

  return (
    <div className={cn("flex shrink-0 items-center gap-3", className)} data-testid="brand-mark">
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <img
        src={logo}
        alt={name ?? "Gym logo"}
        style={plate ? { backgroundColor: plate === "light" ? "#ffffff" : "#1c1c1c" } : undefined}
        className={cn("h-8 max-h-8 w-auto max-w-40 object-contain", plate && "p-1")}
      />
    </div>
  );
}
