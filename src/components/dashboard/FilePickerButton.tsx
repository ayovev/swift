import { useCallback, useRef, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";

interface FilePickerButtonProps extends VariantProps<typeof buttonVariants> {
  onFile: (file: File) => void;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A plain button that opens the native file picker and forwards the chosen
 * CSV — the same hidden-input mechanics as UploadDropzone's own `open()`,
 * including resetting the input's value so picking the same file twice still
 * fires a change event. Unlike UploadDropzone this has no drag/drop and no
 * dashed-box visuals: it's a small utility action (replace an already-loaded
 * dataset), not the first-upload call to action.
 */
export function FilePickerButton({
  onFile,
  ariaLabel,
  className,
  variant = "outline",
  size = "sm",
  children,
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(() => inputRef.current?.click(), []);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={open} aria-label={ariaLabel}>
        {children}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
