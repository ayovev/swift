import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

interface QrDisplayProps {
  /** The pairing-code text to encode (see pairingCode.ts) — never workout data. */
  value: string;
  className?: string;
}

// "M" trades a somewhat larger module count for headroom to paint the Swift
// icon over the center of the code (see below) without risking a scan
// failure — "L" (the lowest level) was the right call when the code was
// plain, since this is read live off a screen and never printed, but it has
// no redundancy to spare once something is drawn on top of it.
const ERROR_CORRECTION_LEVEL = "M";
const MARGIN_MODULES = 2;
// Module size in physical pixels: aim for TARGET, but shrink toward MIN
// rather than let the canvas outgrow the dialog when the payload is dense
// (see pairingCode.ts's header comment on why that can still happen even
// after trimming).
const TARGET_MODULE_PX = 6;
const MIN_MODULE_PX = 3;
const MAX_CANVAS_PX = 320;

const LOGO_SRC = "/icon-192.png";
// Small enough that its occlusion — plus the white pad around it — stays
// comfortably under what "M"-level error correction can recover, even
// though modules aren't corrupted perfectly uniformly.
const LOGO_SIZE_RATIO = 0.22; // fraction of the canvas's pixel width
const LOGO_PAD_RATIO = 1.15; // white backing square, relative to the logo

/**
 * Paints the Swift icon over the center of an already-rendered QR code, on a
 * small white pad for contrast against the surrounding dark modules. Silent
 * on failure (a slow/blocked image load, or a missing 2d context) — the
 * pairing code underneath is already fully valid and scannable without the
 * badge, so this is purely cosmetic and never worth surfacing as an error.
 * `isCancelled` guards against the image finishing its load after the
 * effect that requested it has already re-run for a new `value` or unmounted
 * — without it, a slow-loading badge could land on a canvas that's since
 * moved on to a different pairing code.
 */
function drawCenterLogo(canvas: HTMLCanvasElement, isCancelled: () => boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const logo = new Image();
  logo.onload = () => {
    if (isCancelled()) return;
    const logoSize = canvas.width * LOGO_SIZE_RATIO;
    const padSize = logoSize * LOGO_PAD_RATIO;
    const center = canvas.width / 2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(center - padSize / 2, center - padSize / 2, padSize, padSize);
    ctx.drawImage(logo, center - logoSize / 2, center - logoSize / 2, logoSize, logoSize);
  };
  logo.src = LOGO_SRC;
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
    let cancelled = false;

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

    QRCode.toCanvas(canvas, value, { errorCorrectionLevel: ERROR_CORRECTION_LEVEL, margin: MARGIN_MODULES, scale })
      .then(() => drawCenterLogo(canvas, () => cancelled))
      .catch(() => {
        setError(true);
      });

    return () => {
      cancelled = true;
    };
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
