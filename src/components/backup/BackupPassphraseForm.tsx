import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MIN_PASSPHRASE_LENGTH,
  passphraseProblem,
  passphraseStrength,
  STRENGTH_LABEL,
  STRENGTH_SEGMENTS,
} from "@/lib/backup/passphrase";
import { cn } from "@/lib/utils";
import { PassphraseField } from "./PassphraseField";

interface BackupPassphraseFormProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  passphrase: string;
  onPassphraseChange: (value: string) => void;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  /** False when this browser has no Web Crypto (an insecure page, a very old browser). */
  available: boolean;
  disabled?: boolean | undefined;
}

/**
 * "Protect with a passphrase" for a new backup: a checkbox, and once it's on,
 * the passphrase typed twice with a strength hint. Everything is controlled by
 * the parent, which decides when to clear it; nothing here is stored. Errors
 * wait until there is something to be wrong about, so an empty field isn't
 * shouted at.
 */
export function BackupPassphraseForm({
  enabled,
  onEnabledChange,
  passphrase,
  onPassphraseChange,
  confirmation,
  onConfirmationChange,
  available,
  disabled,
}: BackupPassphraseFormProps) {
  const checkId = useId();
  const hintId = useId();
  const errorId = useId();
  const strength = passphraseStrength(passphrase);
  const problem = passphraseProblem(passphrase, confirmation);
  const tooShort = passphrase.length > 0 && problem === "too_short";
  const mismatch = confirmation.length > 0 && problem === "mismatch";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={checkId}
          checked={enabled && available}
          onCheckedChange={(next) => onEnabledChange(next === true)}
          disabled={disabled || !available}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={checkId}>Protect with a passphrase</Label>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {available
              ? "Swift can't recover a forgotten passphrase. There's no account and no server."
              : "This browser can't encrypt backups."}
          </p>
        </div>
      </div>

      {enabled && available ? (
        <div className="flex flex-col gap-3 pl-6.5">
          <PassphraseField
            label="Passphrase"
            value={passphrase}
            onChange={onPassphraseChange}
            autoComplete="new-password"
            invalid={tooShort}
            describedBy={`${hintId} ${errorId}`}
            disabled={disabled}
          />
          <div id={hintId} aria-live="polite" className="flex flex-col gap-1.5">
            <div className="flex gap-1" aria-hidden="true">
              {[1, 2, 3].map((segment) => (
                <span
                  key={segment}
                  className={cn(
                    "h-1 grow rounded-full bg-muted",
                    passphrase.length > 0 && segment <= STRENGTH_SEGMENTS[strength] && "bg-primary"
                  )}
                />
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
              {passphrase.length > 0 ? `${STRENGTH_LABEL[strength]}. ` : ""}
              Longer is better. A few random words works.
            </p>
          </div>
          <PassphraseField
            label="Confirm passphrase"
            value={confirmation}
            onChange={onConfirmationChange}
            autoComplete="new-password"
            invalid={mismatch}
            describedBy={errorId}
            disabled={disabled}
          />
          <p id={errorId} role="alert" className="min-h-0 text-[13px] text-destructive empty:hidden">
            {tooShort
              ? `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`
              : mismatch
                ? "The two passphrases don't match."
                : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
