import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

interface QrDisplayProps {
  /** The pairing-code text to encode (see pairingCode.ts) — never workout data. */
  value: string;
  className?: string;
}

// "L" (the lowest error-correction level) buys the smallest possible module
// count for a given payload. That trade only makes sense because this code
// is read live off a screen, never printed or exposed to physical damage —
// the usual reason to want higher error correction doesn't apply here, and
// fewer modules is exactly what a camera needs to resolve it reliably.
const ERROR_CORRECTION_LEVEL = "L";
const MARGIN_MODULES = 2;
// Module size in physical pixels: aim for TARGET, but shrink toward MIN
// rather than let the canvas outgrow the dialog when the payload is dense
// (see pairingCode.ts's header comment on why that can still happen even
// after trimming).
const TARGET_MODULE_PX = 6;
const MIN_MODULE_PX = 3;
const MAX_CANVAS_PX = 320;

/**
 * Renders `value` as a QR code. The only file that imports the `qrcode`
 * package, so the rest of the sync UI never needs to know which QR library
 * is in use.
 */
export function QrDisplay({ value, className }: QrDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(false);

    let scale: number;
    try {
      // Read-only sizing pass: figure out how many modules this payload
      // needs so the canvas can grow to fit them at a legible pixel size,
      // instead of always rendering at the same fixed width regardless of
      // how dense the code is.
      const symbolModules = QRCode.create(value, { errorCorrectionLevel: ERROR_CORRECTION_LEVEL }).modules.size;
      const totalModules = symbolModules + MARGIN_MODULES * 2;
      scale = Math.max(MIN_MODULE_PX, Math.min(TARGET_MODULE_PX, Math.floor(MAX_CANVAS_PX / totalModules)));
    } catch {
      setError(true);
      return;
    }

    QRCode.toCanvas(canvas, value, { errorCorrectionLevel: ERROR_CORRECTION_LEVEL, margin: MARGIN_MODULES, scale }).catch(() => {
      setError(true);
    });
  }, [value]);

  if (error) {
    return <p className="text-sm text-muted-foreground">Couldn't generate a QR code for this pairing code.</p>;
  }

  // max-w-full/h-auto keep the canvas within its container's actual width
  // regardless of the native pixel size the sizing math above picks — a
  // dense payload (or, on a small phone, the dialog's own padded width) can
  // otherwise render wider than the viewport has room for.
  return <canvas ref={canvasRef} className={cn("max-w-full h-auto", className)} role="img" aria-label="Pairing QR code" />;
}
