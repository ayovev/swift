import { Fragment } from "react";
import { MODALITY_SHORT_LABELS, type Modality, type ModalitySplit } from "@/types/modality";
import { cn } from "@/lib/utils";
import { FIXED_MODALITY_COLORS, MODALITY_DRAW_ORDER } from "./chartUtils";

/**
 * One workout's M/W/G split as a thin horizontal stacked bar — the per-row
 * visual on the Workouts tab. Segments use FIXED_MODALITY_COLORS, the fixed
 * red/green/blue-reading steps from the lift chart's own rep-max ramp. The
 * Overview stacked bar chart shares this same fixed palette (see
 * MODALITY_FIXED_CHART_CONFIG) so the two readings of M/W/G match; the
 * per-modality tabs still use the accent-derived modalityColor(), since each
 * of those is a single series rather than a composition being compared
 * across colors.
 *
 * Segments run in MODALITY_DRAW_ORDER (W, G, M), so red and green never touch; see there for why.
 *
 * Zero-share modalities render no segment at all (a 0-width div would still
 * need a rounded end), and the bar rounds whichever segments land first/last
 * among the ones actually present. A 2px inset shadow in the surface color
 * stands in for a true gap between segments without perturbing the percentage
 * widths — this bar is ~8px tall, too thin for a layout-affecting gap.
 */
export function ModalityBar({ split, classified }: { split: ModalitySplit; classified: boolean }) {
  if (!classified) {
    return (
      <div
        className="h-2 w-full rounded-full bg-muted"
        role="img"
        aria-label="Not classified — no recognised movement"
      />
    );
  }

  const segments = MODALITY_DRAW_ORDER.filter((m) => split[m] > 0);
  const label = segments.map((m) => `${MODALITY_SHORT_LABELS[m]} ${split[m].toFixed(0)}%`).join(", ");

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label}>
      <div className="flex h-full w-full">
        {segments.map((m, i) => (
          <div
            key={m}
            className={i === 0 ? "rounded-l-full" : i === segments.length - 1 ? "rounded-r-full" : ""}
            style={{
              width: `${split[m]}%`,
              backgroundColor: FIXED_MODALITY_COLORS[m],
              boxShadow: i < segments.length - 1 ? "inset -2px 0 0 0 var(--background)" : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** A modality's colour as a small dot, for a label that sits next to a bar of that colour. Decorative: the letter beside it carries the meaning. */
export function ModalityDot({ m, className }: { m: Modality; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ backgroundColor: FIXED_MODALITY_COLORS[m] }} aria-hidden="true" />;
}

/**
 * The letters of a split in the bar's own order, each after its colour: the column header over the Workouts bars. It stays in view
 * (the header is sticky), so every bar has its colours named directly above it, where the page's key scrolls away after a few rows.
 */
export function ModalityHeaderKey() {
  return (
    <span className="inline-flex items-center gap-2.5 sm:gap-3">
      {MODALITY_DRAW_ORDER.map((m) => (
        <span key={m} className="inline-flex items-center gap-1">
          <ModalityDot m={m} />
          {m}
        </span>
      ))}
    </span>
  );
}

/**
 * A split as text with each value after its colour: "● W 67 · ● G 0 · ● M 33". The text stays grey: the fixed modality colours are
 * not dark enough for small text, and the letters already mean the colour is never the only cue. The dots are decorative, so the
 * text reads as splitText() once spacing is normalised (the separators are their own flex items, so the gaps either side match).
 */
export function SplitLine({ split }: { split: ModalitySplit }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {MODALITY_DRAW_ORDER.map((m, i) => (
        <Fragment key={m}>
          {i > 0 ? <span aria-hidden="true">·</span> : null}
          <span className="inline-flex items-center gap-1">
            <ModalityDot m={m} className="size-1.5" />
            {`${m} ${split[m].toFixed(0)}`}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
