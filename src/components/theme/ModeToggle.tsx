import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/posthog";
import { useTheme, type ModePreference } from "@/lib/theme/useTheme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ModePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Light / dark / follow-system. */
export function ModeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour mode"
      className="inline-flex items-center rounded-lg border border-border bg-card p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
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
            className={cn(
              "h-7 w-8 rounded-md px-0 text-muted-foreground hover:text-foreground",
              active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
