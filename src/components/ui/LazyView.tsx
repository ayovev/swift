import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variant = "inline" | "floating" | "page";

/**
 * The loading state for a view or dialog whose code is fetched on demand (`React.lazy`).
 *
 * It is deliberately quiet: the line is invisible for its first 300ms (`.loading-note`, index.css), so on a fast
 * connection nothing flashes, and then fades in as one plain sentence. `inline` reserves the height the finished view
 * will fill (a view's footer stays put instead of jumping up and then back down); `floating` is for a dialog,
 * which has no page position to hold, so the line sits at the bottom of the window; `page` stands in for a whole screen.
 *
 * `data-view-loading` is what tests and the timing script wait on to know a chunk has arrived.
 */
export function ViewLoading({ label, variant = "inline" }: { label: string; variant?: Variant }) {
  return (
    <div
      role="status"
      data-view-loading=""
      className={cn(
        variant === "inline" && "min-h-[28rem] pt-2",
        variant === "page" && "grid min-h-svh place-items-center bg-background",
        variant === "floating" && "pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
      )}
    >
      <p
        className={cn(
          "loading-note text-sm text-muted-foreground",
          variant === "floating" && "rounded-md border border-border bg-background px-3 py-2 shadow-sm"
        )}
      >
        {label}
      </p>
    </div>
  );
}

/**
 * Catches a chunk that failed to load. The usual cause is a deploy: a tab left open on the old build asks for a file the
 * new one no longer has. Without this the failed import unmounts the whole app to a blank page. A reload fetches the new build and,
 * for an uploaded log, the data comes back from this browser's own storage.
 */
class ChunkBoundary extends Component<{ children: ReactNode; variant: Variant }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console only: nothing about the failure is sent anywhere (see the closed analytics vocabulary).
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className={cn("flex flex-col items-start gap-3 text-sm", this.props.variant === "inline" && "min-h-[28rem] pt-2", this.props.variant === "page" && "min-h-svh justify-center items-center bg-background")}>
        <p>This part of the page didn't load. Reload to try again.</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}

/** A lazily loaded view or dialog: the quiet loading line while its chunk arrives, and a plain notice if it cannot. */
export function LazyView({
  children,
  label = "Loading",
  variant = "inline",
}: {
  children: ReactNode;
  label?: string;
  variant?: Variant;
}) {
  return (
    <ChunkBoundary variant={variant}>
      <Suspense fallback={<ViewLoading label={label} variant={variant} />}>{children}</Suspense>
    </ChunkBoundary>
  );
}
