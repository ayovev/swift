import { useCallback, useRef, useState, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  loading: boolean;
  onFile: (file: File) => void;
  ariaLabel?: string;
  loadingLabel?: string;
  loadingHint?: string;
  hint?: string;
  /** "bar" is Landing's plate-loaded loading bar; every other caller keeps the spinner. */
  loadingVariant?: "spinner" | "bar";
}

/** Drag-and-drop or click-to-browse CSV input. */
export function UploadDropzone({
  loading,
  onFile,
  ariaLabel = "Upload your SugarWOD CSV export",
  loadingLabel = "Reading your training history…",
  loadingHint = "Four years of workouts takes a second or two.",
  hint = "The .csv file SugarWOD gives you from Export Workouts",
  loadingVariant = "spinner",
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const open = useCallback(() => inputRef.current?.click(), []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-busy={loading}
      className={cn(
        "group relative flex w-full cursor-pointer flex-col items-center justify-center gap-3",
        "rounded-xl border-2 border-dashed border-border px-6 py-12 text-center",
        "transition-colors hover:border-primary hover:bg-accent-subtle",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        dragActive && "border-primary bg-accent-subtle",
        loading && "pointer-events-none opacity-70"
      )}
    >
      {loading ? (
        <>
          {loadingVariant === "bar" ? (
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted" role="presentation">
              <div className="h-full w-1/3 animate-[load-bar_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
          ) : (
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          )}
          <p className="text-sm font-medium">{loadingLabel}</p>
          <p className="text-xs text-muted-foreground">{loadingHint}</p>
        </>
      ) : (
        <>
          <Upload
            className="size-6 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">
            Drop your CSV here, or <span className="text-accent-link underline underline-offset-4">browse</span>
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Reset so picking the same file twice still fires a change event.
          e.target.value = "";
        }}
      />
    </div>
  );
}
