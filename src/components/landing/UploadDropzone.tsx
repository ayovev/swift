import { useCallback, useRef, useState, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  loading: boolean;
  onFile: (file: File) => void;
}

/** Drag-and-drop or click-to-browse CSV input (FR-1.1, FR-1.5). */
export function UploadDropzone({ loading, onFile }: UploadDropzoneProps) {
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
      aria-label="Upload your SugarWOD CSV export"
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
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">Reading your training history…</p>
          <p className="text-xs text-muted-foreground">
            Four years of workouts takes a second or two.
          </p>
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
          <p className="text-xs text-muted-foreground">
            The .csv file SugarWOD gives you from Export Workouts
          </p>
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
