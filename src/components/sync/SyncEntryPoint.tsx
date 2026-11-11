import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import type { SyncRole } from "@/lib/posthog";
import type { OutgoingDataset } from "@/lib/sync/syncSession";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { LazyView, ViewLoading } from "@/components/ui/LazyView";
import { lazyComponent } from "@/components/ui/lazyComponent";

/**
 * The pairing wizard is the only importer of the QR scanner and generator (jsqr, qrcode) and of real WebRTC, which together are
 * a good share of the app's JavaScript, and it is used from one button. So it is fetched when that button is first
 * pressed (or hovered or focused, which is nearly always early enough), not with the page.
 */
const syncDialog = lazyComponent(() => import("./SyncDialog").then((m) => ({ default: m.SyncDialog })));
const SyncDialog = syncDialog.Component;
const preloadSyncDialog = syncDialog.preload;

interface SyncEntryPointProps extends VariantProps<typeof buttonVariants> {
  role: SyncRole;
  /** Host role only: what this device would offer, if it has it. */
  outgoing?: OutgoingDataset[];
  existingWorkoutCount: number | null;
  existingBodyCompCount: number | null;
  existingTimelineCount: number | null;
  existingWeighInsCount: number | null;
  onSyncedWorkoutData: (rows: SugarWodRow[]) => void;
  onSyncedBodyCompData: (rows: InBodyRow[]) => void;
  onSyncedTimeline: (entries: TimelineEntry[]) => void;
  onSyncedWeighIns: (weighIns: WeighIn[]) => void;
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
  existingTimelineCount,
  existingWeighInsCount,
  onSyncedWorkoutData,
  onSyncedBodyCompData,
  onSyncedTimeline,
  onSyncedWeighIns,
  disabled,
  variant = "outline",
  size = "sm",
  className,
  children,
}: SyncEntryPointProps) {
  const [open, setOpen] = useState(false);
  // Mounted from the first press and then kept, so closing the dialog still plays Radix's exit animation.
  const [requested, setRequested] = useState(false);
  // Between the press and the chunk's arrival: the press waits for the code, then mounts the dialog, so a dialog never opens
  // through a Suspense fallback (which holds the real content back for 300ms even when the chunk is nearly here).
  const [pending, setPending] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        onPointerEnter={preloadSyncDialog}
        onFocus={preloadSyncDialog}
        onClick={() => {
          setPending(true);
          void syncDialog.whenLoaded().then(() => {
            setPending(false);
            setRequested(true);
            setOpen(true);
          });
        }}
      >
        {children}
      </Button>
      {pending ? <ViewLoading label="Loading" variant="floating" /> : null}
      {requested ? (
        <LazyView variant="floating" label="Loading">
          <SyncDialog
            open={open}
            onOpenChange={setOpen}
            role={role}
            {...(outgoing ? { outgoing } : {})}
            existingWorkoutCount={existingWorkoutCount}
            existingBodyCompCount={existingBodyCompCount}
            existingTimelineCount={existingTimelineCount}
            existingWeighInsCount={existingWeighInsCount}
            onSyncedWorkoutData={onSyncedWorkoutData}
            onSyncedBodyCompData={onSyncedBodyCompData}
            onSyncedTimeline={onSyncedTimeline}
            onSyncedWeighIns={onSyncedWeighIns}
          />
        </LazyView>
      ) : null}
    </>
  );
}
