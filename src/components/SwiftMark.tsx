import { cn } from "@/lib/utils";

/** The Swift wordmark. Black-and-white by design; the accent is used sparingly. */
export function SwiftMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className="text-lg font-semibold tracking-tight">Swift</span>
      <span aria-hidden="true" className="h-3 w-px bg-border" />
      <span className="text-xs text-muted-foreground">SugarWOD insights</span>
    </div>
  );
}
