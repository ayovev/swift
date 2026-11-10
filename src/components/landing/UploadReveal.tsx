import { useEffect, useState } from "react";

interface UploadRevealProps {
  workoutCount: number;
  prCount: number;
  /** Entries not in the file this one replaced; absent on a first upload. */
  newCount?: number | undefined;
}

function useCountUp(target: number, durationMs = 350): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || target === 0) {
      setValue(target);
      return;
    }

    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

/**
 * The board updating itself, right after a file parses — "1,209 workouts
 * logged. 12 personal records." Fills the same slot the dropzone/loading bar
 * occupied, so nothing jumps, and App.tsx swaps this out for the dashboard
 * a beat later.
 */
export function UploadReveal({ workoutCount, prCount, newCount }: UploadRevealProps) {
  const workouts = useCountUp(workoutCount);
  const prs = useCountUp(prCount);

  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-transparent bg-muted/40 px-6 py-12 text-center"
      aria-live="polite"
    >
      <p className="tabular text-sm font-medium">
        {workouts.toLocaleString()} workouts logged · {prs.toLocaleString()} personal records
      </p>
      {newCount !== undefined ? (
        <p className="text-sm">
          {newCount === 0
            ? "No new workouts since your last upload."
            : `${newCount.toLocaleString()} new ${newCount === 1 ? "workout" : "workouts"} since your last upload.`}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Pulling up your dashboard…</p>
    </div>
  );
}
