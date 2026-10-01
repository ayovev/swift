import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UploadDropzone } from "@/components/landing/UploadDropzone";
import type { BodyCompState } from "./BodyCompTab";

/**
 * The static state every view that needs an InBody export shows until one is
 * loaded: what the view does (`children`, one sentence or two), an error if
 * the last upload failed, and the same dropzone Body Comp uses. One
 * component so the copy and the upload entry point can't drift apart between
 * Body Comp, Progress and Compare.
 *
 * "Your files" is plural on purpose: by the time any dashboard view is
 * showing, a SugarWOD log is loaded as well, so both exports are in play.
 */
export function InBodyUploadPrompt({
  state,
  onFile,
  header,
  children,
}: {
  state: BodyCompState;
  onFile: (file: File) => void;
  /** Optional strip above the copy (Body Comp puts the InBody mark here). */
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      {header ? <CardHeader className="flex flex-row items-center gap-3 pb-2">{header}</CardHeader> : null}
      <CardContent className="flex flex-col gap-4">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>

        {state.status === "error" ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>That file didn't work</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <UploadDropzone
          loading={state.status === "loading"}
          onFile={onFile}
          ariaLabel="Upload your InBody CSV export"
          loadingLabel="Reading your body composition history…"
          loadingHint="This only takes a moment."
          hint="The .csv file the InBody app gives you from Export"
        />
        <p className="text-xs text-muted-foreground">Your files never leave this browser.</p>
      </CardContent>
    </Card>
  );
}
