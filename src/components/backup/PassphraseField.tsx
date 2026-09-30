import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PassphraseFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** `new-password` when creating one, `current-password` when entering one, so a password manager can help. */
  autoComplete: "new-password" | "current-password";
  autoFocus?: boolean | undefined;
  invalid?: boolean | undefined;
  /** Ids of hint or error text that describes this field. */
  describedBy?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A passphrase input with its own show/hide toggle on the right, inside the
 * field. The toggle is a real button (`aria-pressed`) placed after the input,
 * and Enter in the input still submits the form. Each field toggles
 * independently, so revealing one doesn't reveal the other.
 */
export function PassphraseField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  invalid,
  describedBy,
  disabled,
}: PassphraseFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const toggleLabel = `${visible ? "Hide" : "Show"} ${label.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={toggleLabel}
          aria-pressed={visible}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
