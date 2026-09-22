import { MODALITY_LIST, MODALITY_SHORT_LABELS, type ModalitySplit } from "@/types/modality";
import { modalityColor } from "./chartUtils";

/**
 * One workout's M/W/G split as a thin horizontal stacked bar — the per-row
 * visual on the Workouts tab. Segments use the same modalityColor() as every
 * other modality chart, so a bar here reads as "the same three colors" as the
 * stacked area chart on Overview and the modality tabs, not a new palette.
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

  const segments = MODALITY_LIST.filter((m) => split[m] > 0);
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
              backgroundColor: modalityColor(m),
              boxShadow: i < segments.length - 1 ? "inset -2px 0 0 0 var(--background)" : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
