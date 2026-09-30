import { useEffect } from "react";
import { AlertCircle, FileUp, Lock, PlayCircle, Smartphone } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ThemeControls } from "@/components/theme/ThemeControls";
import { FilePickerButton } from "@/components/dashboard/FilePickerButton";
import { useBackupImport } from "@/components/backup/useBackupImport";
import { SyncEntryPoint } from "@/components/sync/SyncEntryPoint";
import { ExportGuide } from "./ExportGuide";
import { HowItWorks } from "./HowItWorks";
import { UploadDropzone } from "./UploadDropzone";
import { UploadReveal } from "./UploadReveal";
import { WhiteboardTexture } from "./WhiteboardTexture";
import { SwiftMark } from "@/components/SwiftMark";
import type { Experiment } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";

interface RevealSummary {
  workoutCount: number;
  prCount: number;
}

interface LandingProps {
  loading: boolean;
  reveal: RevealSummary | null;
  error: string | null;
  onFile: (file: File) => void;
  onSample: () => void;
  onDismissError: () => void;
  onSyncedWorkoutData: (rows: SugarWodRow[]) => void;
  onSyncedBodyCompData: (rows: InBodyRow[]) => void;
  onSyncedExperiments: (experiments: Experiment[]) => void;
  onSyncedTags: (tags: ContextTag[]) => void;
}

export function Landing({
  loading,
  reveal,
  error,
  onFile,
  onSample,
  onDismissError,
  onSyncedWorkoutData,
  onSyncedBodyCompData,
  onSyncedExperiments,
  onSyncedTags,
}: LandingProps) {
  const busy = loading || reveal !== null;
  // Nothing is stored yet, so a backup restores without asking.
  const backupImport = useBackupImport({
    existing: { workout: null, bodyComp: null, experiments: null, tags: null },
    handlers: {
      workout: onSyncedWorkoutData,
      bodyComp: onSyncedBodyCompData,
      experiments: onSyncedExperiments,
      tags: onSyncedTags,
    },
  });

  // A copied file works anywhere on the page, not just when the dropzone is
  // focused — the fastest of the three ways in, alongside drag/drop and browse.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (busy) return;
      const file = e.clipboardData?.files?.[0];
      if (file) {
        e.preventDefault();
        onFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [busy, onFile]);

  return (
    <div className="relative isolate min-h-svh bg-background">
      <WhiteboardTexture />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <SwiftMark />
        <ThemeControls />
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-24">
        <section className="mx-auto max-w-2xl pt-12 text-center sm:pt-20">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            The workout ends. The work doesn't.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
            Upload your SugarWOD export and see what years of workouts add up to — how often you
            showed up, what got heavier, and which of the ten physical skills your training has
            actually been building.
          </p>

          <div className="mt-9">
            {reveal ? (
              <UploadReveal workoutCount={reveal.workoutCount} prCount={reveal.prCount} />
            ) : (
              <UploadDropzone loading={loading} onFile={onFile} loadingVariant="bar" frame="soft" />
            )}
          </div>

          {error ? (
            <Alert variant="destructive" className="mt-5 text-left">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertTitle>That file didn't work</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={onDismissError}>
                  Try another file
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-6 flex flex-col items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onSample} disabled={busy} className="gap-2">
              <PlayCircle className="size-4" aria-hidden="true" />
              Or try it with sample data
            </Button>
            <SyncEntryPoint
              role="joiner"
              existingWorkoutCount={null}
              existingBodyCompCount={null}
              existingExperimentsCount={null}
              existingTagsCount={null}
              onSyncedWorkoutData={onSyncedWorkoutData}
              onSyncedBodyCompData={onSyncedBodyCompData}
              onSyncedExperiments={onSyncedExperiments}
              onSyncedTags={onSyncedTags}
              disabled={busy}
              variant="ghost"
              className="gap-2"
            >
              <Smartphone className="size-4" aria-hidden="true" />
              Sync from another device
            </SyncEntryPoint>
            <FilePickerButton
              onFile={backupImport.importFile}
              accept="application/json,.json"
              variant="ghost"
              disabled={busy}
              className="gap-2"
            >
              <FileUp className="size-4" aria-hidden="true" />
              Import a backup
            </FilePickerButton>
            {backupImport.message ? (
              <p role="status" className="text-center text-[13px] text-muted-foreground">
                {backupImport.message}
              </p>
            ) : null}
            {backupImport.dialog}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              Your file never leaves this browser. There's no account and no server.
            </p>
          </div>

          <ExportGuide />
        </section>

        <section className="mt-28 sm:mt-32" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="mb-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            How it works
          </h2>
          <HowItWorks />
        </section>
      </main>
    </div>
  );
}
