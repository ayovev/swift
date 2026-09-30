import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { SyncSessionState } from "@/lib/sync/syncSession";
import { DATASET_LABEL } from "@/lib/sync/datasetLabels";
import { QrDisplay } from "./QrDisplay";
import { QrScanner } from "./QrScanner";

interface HostQrViewProps {
  state: SyncSessionState;
  onScanAnswer: (answerCode: string) => void;
}

/**
 * The host's half of the pairing wizard: show an offer QR, scan the
 * joiner's answer QR, then track the transfer. SyncDialog owns the
 * SyncSession itself (via useSyncSession) and hands this component only its
 * current state — this file is pure rendering.
 *
 * "awaiting-answer" covers the whole "I've shown my code, now I need to scan
 * theirs" period as one session state — there's no session-level signal for
 * when the joiner is actually ready to be scanned. Showing the offer QR and
 * the live camera at once here was cluttered and left it unclear which one
 * the athlete should be doing, so this component keeps its own local step
 * to show them one at a time instead.
 */
export function HostQrView({ state, onScanAnswer }: HostQrViewProps) {
  const [step, setStep] = useState<"show-offer" | "scan-answer">("show-offer");

  switch (state.status) {
    case "idle":
    case "generating-offer":
      return <p className="text-sm text-muted-foreground">Preparing a pairing code…</p>;

    case "awaiting-answer":
      if (step === "show-offer") {
        return (
          <div className="flex flex-col items-center gap-4">
            <QrDisplay value={state.offerCode} className="rounded-md border border-border" />
            <p className="text-center text-sm text-muted-foreground">Scan this on your other device.</p>
            <Button onClick={() => setStep("scan-answer")}>Next: scan their code</Button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Scan the code your other device is now showing.
          </p>
          <QrScanner onDecode={onScanAnswer} className="aspect-square w-full max-w-xs rounded-md border border-border object-cover" />
          <Button variant="ghost" onClick={() => setStep("show-offer")}>
            Back to my code
          </Button>
        </div>
      );

    case "connecting":
    case "connected":
      return <p className="text-sm text-muted-foreground">Connecting…</p>;

    case "transferring": {
      const pct = state.totalBytes > 0 ? Math.round((state.receivedBytes / state.totalBytes) * 100) : 0;
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Sending your {DATASET_LABEL[state.dataset]}…
          </p>
          <Progress value={pct} />
        </div>
      );
    }

    case "done":
      return <p className="text-sm text-muted-foreground">Sent. The other device now has this data.</p>;

    case "failed":
    default:
      // "failed" is rendered by SyncDialog itself; "generating-answer" and
      // "awaiting-connection" are joiner-only states that never occur here.
      return null;
  }
}
