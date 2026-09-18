import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACTIVE_SEGMENT_CLASSES } from "@/components/dashboard/SegmentedControl";
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
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
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
            className={cn("h-7 w-8 px-0", active && ACTIVE_SEGMENT_CLASSES)}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
