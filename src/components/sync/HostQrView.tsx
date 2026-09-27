import { Progress } from "@/components/ui/progress";
import type { SyncSessionState } from "@/lib/sync/syncSession";
import { QrDisplay } from "./QrDisplay";
import { QrScanner } from "./QrScanner";

const DATASET_LABEL: Record<string, string> = { workout: "workout log", bodyComp: "body composition history" };

interface HostQrViewProps {
  state: SyncSessionState;
  onScanAnswer: (answerCode: string) => void;
}

/**
 * The host's half of the pairing wizard: show an offer QR, scan the
 * joiner's answer QR, then track the transfer. SyncDialog owns the
 * SyncSession itself (via useSyncSession) and hands this component only its
 * current state — this file is pure rendering.
 */
export function HostQrView({ state, onScanAnswer }: HostQrViewProps) {
  switch (state.status) {
    case "idle":
    case "generating-offer":
      return <p className="text-sm text-muted-foreground">Preparing a pairing code…</p>;

    case "awaiting-answer":
      return (
        <div className="flex flex-col items-center gap-4">
          <QrDisplay value={state.offerCode} className="rounded-md border border-border" />
          <p className="text-center text-sm text-muted-foreground">
            Scan this on your other device. Then scan the code it shows below.
          </p>
          <QrScanner onDecode={onScanAnswer} className="aspect-square w-full max-w-xs rounded-md border border-border object-cover" />
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
            Sending your {DATASET_LABEL[state.dataset] ?? state.dataset}…
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
