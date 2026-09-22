import { useEffect } from "react";
import { AlertCircle, Lock, PlayCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AccentPicker } from "@/components/theme/AccentPicker";
import { ModeToggle } from "@/components/theme/ModeToggle";
import { ExportGuide } from "./ExportGuide";
import { HowItWorks } from "./HowItWorks";
import { UploadDropzone } from "./UploadDropzone";
import { UploadReveal } from "./UploadReveal";
import { WhiteboardTexture } from "./WhiteboardTexture";
import { SwiftMark } from "@/components/SwiftMark";

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
}

export function Landing({ loading, reveal, error, onFile, onSample, onDismissError }: LandingProps) {
  const busy = loading || reveal !== null;

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
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <SwiftMark />
        <div className="flex items-center gap-2">
          <AccentPicker />
          <ModeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-24">
        <section className="relative isolate mx-auto max-w-2xl pt-12 text-center sm:pt-20">
          <WhiteboardTexture />

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            The workout ends. The work doesn't.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
            Upload your SugarWOD export and see what years of workouts add up to — how often you
            showed up, what got heavier, and which of the ten physical skills your training has
            actually been building.
          </p>

          <p className="mt-10 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Today's WOD
          </p>

          <div className="mt-4">
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
