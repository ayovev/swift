import { useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Monitor,
  Moon,
  SlidersHorizontal,
  Sun,
  XIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BackupPassphraseForm } from "@/components/backup/BackupPassphraseForm";
import { DownloadBackupButton } from "@/components/backup/DownloadBackupButton";
import { useBackupRestore } from "@/components/backup/useBackupRestore";
import { SyncEntryPoint } from "@/components/sync/SyncEntryPoint";
import { ACTIVE_SEGMENT_CLASSES } from "./SegmentedControl";
import { FilePickerButton } from "./FilePickerButton";
import type { BodyCompState } from "./BodyCompTab";
import { cryptoAvailable } from "@/lib/backup/encryption";
import { passphraseProblem } from "@/lib/backup/passphrase";
import { capture } from "@/lib/posthog";
import { formatOklch } from "@/lib/theme/contrast";
import { ACCENT_SWATCHES, accentRoles } from "@/lib/theme/palette";
import { useTheme, type ModePreference } from "@/lib/theme/useTheme";
import type { OutgoingDataset } from "@/lib/sync/syncSession";
import { cn } from "@/lib/utils";
import type { DataSource } from "@/App";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";

const MODES: { value: ModePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

interface SettingsSheetProps {
  source: DataSource;
  workoutRows: SugarWodRow[];
  onWorkoutFile: (file: File) => void;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
  tags: ContextTag[];
  /** Host role only: what this device would send. Built once in Dashboard.tsx. */
  syncOutgoing: OutgoingDataset[];
  onSyncedWorkoutData: (rows: SugarWodRow[]) => void;
  onSyncedBodyCompData: (rows: InBodyRow[]) => void;
  onSyncedTags: (tags: ContextTag[]) => void;
  onReset: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3.5 border-b border-border py-5 last:border-b-0">
      <h3 className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function DatasetRow({ title, detail, action }: { title: string; detail: string; action: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{detail}</span>
      </div>
      {action}
    </div>
  );
}

/**
 * Everything on the dashboard that is neither navigation nor view scope,
 * in one sheet behind the header's single Settings button: replacing either
 * uploaded file, backing up to or restoring from a file, syncing to or from
 * another device, accent and colour mode, and Start over.
 *
 * These used to be six separate controls across the header (and "Replace
 * file" for InBody only on the Body Comp tab). They're used monthly at most
 * — a fresh export, a new device, a one-time theme pick — so they don't
 * earn permanent header space next to controls used on every visit. Each
 * control still calls exactly the handler it did before (`handleFile`,
 * `handleBodyCompFile`, the sync handlers, `reset`), so moving them here
 * changes where they live, not what they do.
 *
 * Start over keeps its existing split: confirmed through an AlertDialog when
 * real uploaded data is at stake, immediate in sample mode, where nothing
 * persisted can be lost. Sync is shown but disabled in sample mode — sample
 * data was never meant to leave this device, and a disabled control with a
 * one-line reason is clearer than a control that's simply absent.
 */
export function SettingsSheet(props: SettingsSheetProps) {
  const [open, setOpen] = useState(false);
  const { accent, setAccent, mode, setMode, resolvedMode } = useTheme();
  const upload = props.source === "upload";

  // Passphrase for a new encrypted backup. Held here only while the sheet is
  // open: closing it, or finishing a download, clears all three.
  const [protect, setProtect] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const clearPassphrase = () => {
    setPassphrase("");
    setConfirmation("");
  };
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setProtect(false);
      clearPassphrase();
    }
  };
  const canDownload = upload && (!protect || passphraseProblem(passphrase, confirmation) === null);
  // Sample data is never stored, so importing over it has nothing to confirm.
  const backupRestore = useBackupRestore({
    existing: {
      workout: upload ? props.workoutRows.length : null,
      bodyComp: upload && props.bodyComp.status === "ready" ? props.bodyComp.rows.length : null,
      tags: upload && props.tags.length > 0 ? props.tags.length : null,
    },
    handlers: {
      workout: props.onSyncedWorkoutData,
      bodyComp: props.onSyncedBodyCompData,
      tags: props.onSyncedTags,
    },
  });

  const reset = () => {
    changeOpen(false);
    props.onReset();
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {/* Ghost, in muted text: it's a door to rarely-used controls, so it
            shouldn't out-weigh the section links beside it. */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 text-muted-foreground hover:text-foreground"
          aria-label="Settings"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="sheet-slide top-0 right-0 left-auto flex h-svh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-[480px]"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5 sm:px-7">
          <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Your data, backup, other devices, appearance, and starting over.
          </DialogDescription>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="sm" className="-mr-2 size-9 p-0" aria-label="Close settings">
              <XIcon className="size-4" aria-hidden="true" />
            </Button>
          </DialogPrimitive.Close>
        </div>

        <div className="flex grow flex-col overflow-y-auto px-5 sm:px-7">
          <Section title="Your data">
            <DatasetRow
              title="Workout log"
              detail={`SugarWOD · ${props.workoutRows.length.toLocaleString()} workouts`}
              action={
                <FilePickerButton onFile={props.onWorkoutFile} ariaLabel="Replace workout log" className="h-8">
                  Replace file
                </FilePickerButton>
              }
            />
            <DatasetRow
              title="Body composition"
              detail={
                props.bodyComp.status === "ready"
                  ? `InBody · ${props.bodyComp.rows.length.toLocaleString()} scans`
                  : "No InBody file yet"
              }
              action={
                <FilePickerButton
                  onFile={props.onBodyCompFile}
                  ariaLabel={props.bodyComp.status === "ready" ? "Replace InBody file" : "Add InBody file"}
                  className="h-8"
                >
                  {props.bodyComp.status === "ready" ? "Replace file" : "Add file"}
                </FilePickerButton>
              }
            />
            <p className="text-[13px] text-muted-foreground">
              {upload
                ? "Stored in this browser only. There's no account and no server."
                : "This is sample data. Nothing is stored."}
            </p>
          </Section>

          <Section title="Backup">
            <p className="text-sm leading-relaxed">
              Save everything stored in this browser as one file, and restore it here or on another computer. The file
              holds your full training and body composition history. Keep it somewhere private.
            </p>
            <DatasetRow
              title="Download backup"
              detail="One file, all your data"
              action={
                <DownloadBackupButton
                  workoutRows={props.workoutRows}
                  bodyComp={props.bodyComp}
                  tags={props.tags}
                  passphrase={protect ? passphrase : undefined}
                  onDownloaded={clearPassphrase}
                  disabled={!canDownload}
                />
              }
            />
            {upload ? (
              <BackupPassphraseForm
                enabled={protect}
                onEnabledChange={(next) => {
                  setProtect(next);
                  if (!next) clearPassphrase();
                }}
                passphrase={passphrase}
                onPassphraseChange={setPassphrase}
                confirmation={confirmation}
                onConfirmationChange={setConfirmation}
                available={cryptoAvailable()}
              />
            ) : null}
            <DatasetRow
              title="Restore from backup"
              detail="Replaces what's stored"
              action={
                <FilePickerButton
                  onFile={backupRestore.restoreFile}
                  accept="application/json,.json"
                  ariaLabel="Restore from backup"
                  className="h-8"
                >
                  Restore
                </FilePickerButton>
              }
            />
            {backupRestore.message ? (
              <p role="status" className="text-[13px] text-muted-foreground">
                {backupRestore.message}
              </p>
            ) : null}
            {!upload ? (
              <p className="text-[13px] text-muted-foreground">Sample data can't be backed up.</p>
            ) : null}
            {backupRestore.dialog}
          </Section>

          <Section title="Other devices">
            <p className="text-sm leading-relaxed">
              Copy your data straight to another browser by scanning a QR code on each screen.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SyncEntryPoint
                role="host"
                outgoing={props.syncOutgoing}
                existingWorkoutCount={null}
                existingBodyCompCount={null}
                existingTagsCount={null}
                onSyncedWorkoutData={props.onSyncedWorkoutData}
                onSyncedBodyCompData={props.onSyncedBodyCompData}
                onSyncedTags={props.onSyncedTags}
                disabled={!upload}
                className="h-10 gap-2"
              >
                <ArrowUpFromLine className="size-3.5" aria-hidden="true" />
                Send to a device
              </SyncEntryPoint>
              <SyncEntryPoint
                role="joiner"
                existingWorkoutCount={props.workoutRows.length}
                existingBodyCompCount={props.bodyComp.status === "ready" ? props.bodyComp.rows.length : null}
                existingTagsCount={props.tags.length > 0 ? props.tags.length : null}
                onSyncedWorkoutData={props.onSyncedWorkoutData}
                onSyncedBodyCompData={props.onSyncedBodyCompData}
                onSyncedTags={props.onSyncedTags}
                disabled={!upload}
                className="h-10 gap-2"
              >
                <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                Receive from a device
              </SyncEntryPoint>
            </div>
            {!upload ? (
              <p className="text-[13px] text-muted-foreground">Available once you've uploaded your own log.</p>
            ) : null}
          </Section>

          <Section title="Appearance">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">Accent</span>
              <div role="radiogroup" aria-label="Accent colour" className="flex items-center gap-2">
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
                        "flex size-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110",
                        active && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      )}
                      style={{ backgroundColor: formatOklch(primary) }}
                    >
                      {active ? (
                        <Check
                          className="size-3"
                          style={{ color: formatOklch(primaryForeground) }}
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">Mode</span>
              <div role="radiogroup" aria-label="Colour mode" className="flex gap-0.5 rounded-md border border-border p-0.5">
                {MODES.map(({ value, label, Icon }) => (
                  <Button
                    key={value}
                    role="radio"
                    aria-checked={mode === value}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMode(value);
                      capture({ name: "theme_changed", props: { mode: value } });
                    }}
                    className={cn("h-7 gap-1.5 px-2.5", mode === value && ACTIVE_SEGMENT_CLASSES)}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Start over">
            <div className="flex items-center gap-4">
              <p className="grow text-[13px] leading-relaxed text-muted-foreground">
                {upload
                  ? "Deletes your workout log, body composition history and periods, experiments included, from this browser."
                  : "Leaves the sample and goes back to the upload screen."}
              </p>
              {upload ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 shrink-0 border-destructive/40 text-destructive">
                      Start over
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Start over?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This deletes your uploaded workout log, body composition history, and any
                        periods you've added, experiments included. This can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={reset}
                        className={buttonVariants({ variant: "destructive", size: "sm" })}
                      >
                        Reset
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button variant="outline" size="sm" onClick={reset} className="h-8 shrink-0">
                  Start over
                </Button>
              )}
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
