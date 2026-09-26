import { Progress } from "@/components/ui/progress";
import type { SyncSessionState } from "@/lib/sync/syncSession";
import { QrDisplay } from "./QrDisplay";
import { QrScanner } from "./QrScanner";

const DATASET_LABEL: Record<string, string> = { workout: "workout log", bodyComp: "body composition history" };

interface JoinerScanViewProps {
  state: SyncSessionState;
  onScanOffer: (offerCode: string) => void;
}

/**
 * The joiner's half of the pairing wizard: scan the host's offer QR, show an
 * answer QR, then track the transfer. Pure rendering over the state
 * SyncDialog hands it — see HostQrView's header comment for the split.
 */
export function JoinerScanView({ state, onScanOffer }: JoinerScanViewProps) {
  switch (state.status) {
    case "idle":
      return (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Scan the code shown on the device that has your data.
          </p>
          <QrScanner onDecode={onScanOffer} className="aspect-square w-full max-w-xs rounded-md border border-border object-cover" />
        </div>
      );

    case "generating-answer":
      return <p className="text-sm text-muted-foreground">Preparing to connect…</p>;

    case "awaiting-connection":
      return (
        <div className="flex flex-col items-center gap-4">
          <QrDisplay value={state.answerCode} className="rounded-md border border-border" />
          <p className="text-center text-sm text-muted-foreground">Now scan this code on the other device.</p>
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
            Receiving {DATASET_LABEL[state.dataset] ?? state.dataset}…
          </p>
          <Progress value={pct} />
        </div>
      );
    }

    case "done":
      return <p className="text-sm text-muted-foreground">Received. Reviewing the data now…</p>;

    case "failed":
    default:
      // "failed" is rendered by SyncDialog itself; "generating-offer" and
      // "awaiting-answer" are host-only states that never occur here.
      return null;
  }
}
