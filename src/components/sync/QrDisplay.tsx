import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface QrDisplayProps {
  /** The pairing-code text to encode (see pairingCode.ts) — never workout data. */
  value: string;
  className?: string;
}

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
    QRCode.toCanvas(canvas, value, { errorCorrectionLevel: "M", margin: 1, width: 280 }).catch(() => {
      setError(true);
    });
  }, [value]);

  if (error) {
    return <p className="text-sm text-muted-foreground">Couldn't generate a QR code for this pairing code.</p>;
  }

  return <canvas ref={canvasRef} className={className} role="img" aria-label="Pairing QR code" />;
}
