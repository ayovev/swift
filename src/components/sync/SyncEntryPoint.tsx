import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import type { SyncRole } from "@/lib/posthog";
import type { OutgoingDataset } from "@/lib/sync/syncSession";
import type { Experiment } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import { SyncDialog } from "./SyncDialog";

interface SyncEntryPointProps extends VariantProps<typeof buttonVariants> {
  role: SyncRole;
  /** Host role only: what this device would offer, if it has it. */
  outgoing?: OutgoingDataset[];
  existingWorkoutCount: number | null;
  existingBodyCompCount: number | null;
  existingExperimentsCount: number | null;
  onSyncedWorkoutData: (rows: SugarWodRow[]) => void;
  onSyncedBodyCompData: (rows: InBodyRow[]) => void;
  onSyncedExperiments: (experiments: Experiment[]) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A plain button that opens the sync pairing wizard (SyncDialog) — the
 * same minimal-wrapper pattern as FilePickerButton, but opening a dialog
 * instead of a native file picker.
 */
export function SyncEntryPoint({
  role,
  outgoing,
  existingWorkoutCount,
  existingBodyCompCount,
  existingExperimentsCount,
  onSyncedWorkoutData,
  onSyncedBodyCompData,
  onSyncedExperiments,
  disabled,
  variant = "outline",
  size = "sm",
  className,
  children,
}: SyncEntryPointProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <SyncDialog
        open={open}
        onOpenChange={setOpen}
        role={role}
        {...(outgoing ? { outgoing } : {})}
        existingWorkoutCount={existingWorkoutCount}
        existingBodyCompCount={existingBodyCompCount}
        existingExperimentsCount={existingExperimentsCount}
        onSyncedWorkoutData={onSyncedWorkoutData}
        onSyncedBodyCompData={onSyncedBodyCompData}
        onSyncedExperiments={onSyncedExperiments}
      />
    </>
  );
}
