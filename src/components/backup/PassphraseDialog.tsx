import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PassphraseField } from "./PassphraseField";

interface PassphraseDialogProps {
  /** A sentence when the last attempt failed. */
  error: string | null;
  busy: boolean;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
}

/**
 * Asks for the passphrase of an encrypted backup. It holds the typed
 * passphrase only while it is on screen: the parent mounts it when a
 * passphrase is needed and unmounts it when the attempt is over, which is
 * what discards the text. Enter submits, and a wrong passphrase leaves the
 * dialog open for another try.
 */
export function PassphraseDialog({ error, busy, onSubmit, onCancel }: PassphraseDialogProps) {
  const [passphrase, setPassphrase] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (passphrase.length > 0 && !busy) onSubmit(passphrase);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>This backup is encrypted</DialogTitle>
            <DialogDescription>Enter the passphrase you set when you downloaded it.</DialogDescription>
          </DialogHeader>
          <PassphraseField
            label="Passphrase"
            value={passphrase}
            onChange={setPassphrase}
            autoComplete="current-password"
            autoFocus
            invalid={error !== null}
            describedBy={error ? "passphrase-error" : undefined}
            disabled={busy}
          />
          {error ? (
            <p id="passphrase-error" role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || passphrase.length === 0}>
              {busy ? "Opening…" : "Restore"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
