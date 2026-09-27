import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export type QrScannerError = "camera_denied" | "unsupported";

interface QrScannerProps {
  /** Called once with the decoded text the first time a QR code is read. */
  onDecode: (text: string) => void;
  onError?: (error: QrScannerError) => void;
  className?: string;
}

const CAMERA_DENIED_MESSAGE = "Camera access was denied. Allow camera access and try again.";
const UNSUPPORTED_MESSAGE = "This browser can't use the camera to scan a QR code.";

/**
 * Captures the device camera and decodes QR codes from it via jsQR,
 * hand-rolling the capture loop rather than depending on an all-in-one
 * scanner package — matches this codebase's preference for owning small
 * primitives (see idbStore.ts, webrtcTransport.ts). The only file that
 * imports jsqr or calls `getUserMedia`.
 */
export function QrScanner({ onDecode, onError, className }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Kept in refs so the effect below only ever runs once per mount — an
  // inline onDecode/onError from the caller gets a new identity every
  // render, and this loop starts a camera stream, not something to tear
  // down and restart on every parent re-render.
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(UNSUPPORTED_MESSAGE);
      onErrorRef.current?.("unsupported");
      return;
    }

    let stream: MediaStream | undefined;
    let frameHandle: number | undefined;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    function tick() {
      const video = videoRef.current;
      if (cancelled || !video || !context) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(frame.data, frame.width, frame.height);
        if (result?.data) {
          onDecodeRef.current(result.data);
          return;
        }
      }
      frameHandle = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        if (!cancelled) {
          setErrorMessage(CAMERA_DENIED_MESSAGE);
          onErrorRef.current?.("camera_denied");
        }
        return;
      }

      if (cancelled || !videoRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      tick();
    }

    void start();

    return () => {
      cancelled = true;
      if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);

  if (errorMessage) {
    return <p className="text-sm text-muted-foreground">{errorMessage}</p>;
  }

  return (
    <video
      ref={videoRef}
      className={className}
      muted
      playsInline
      aria-label="Camera preview for scanning a pairing QR code"
    />
  );
}
