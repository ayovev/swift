import { AlertCircle, Lock, PlayCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AccentPicker } from "@/components/theme/AccentPicker";
import { ModeToggle } from "@/components/theme/ModeToggle";
import { ExportGuide } from "./ExportGuide";
import { HowItWorks } from "./HowItWorks";
import { UploadDropzone } from "./UploadDropzone";
import { SwiftMark } from "@/components/SwiftMark";

interface LandingProps {
  loading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onSample: () => void;
  onDismissError: () => void;
}

export function Landing({ loading, error, onFile, onSample, onDismissError }: LandingProps) {
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
        <section className="mx-auto max-w-2xl pt-10 text-center sm:pt-16">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            The workout ends. The work doesn't.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
            Upload your SugarWOD export and see what years of workouts add up to — how often you
            showed up, what got heavier, and which of the ten physical skills your training has
            actually been building.
          </p>

          <div className="mt-9">
            <UploadDropzone loading={loading} onFile={onFile} />
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

          <div className="mt-5 flex flex-col items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onSample} disabled={loading} className="gap-2">
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

        <section className="mt-20 border-t border-border pt-12" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="mb-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            How it works
          </h2>
          <HowItWorks />
        </section>
      </main>
    </div>
  );
}
