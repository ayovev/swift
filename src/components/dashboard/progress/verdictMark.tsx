import { ArrowDown, ArrowUp, CircleDashed, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * How a verdict is marked, everywhere it is shown: the pill on Progress and Overview, and the glyph on a Timeline row.
 *
 * Shape and a glyph carry the verdict; colour only repeats it. Up used to be marked by the accent alone, so the colour of a verdict
 * was whatever the athlete picked for looks: with the red accent, Up and Down were both red, and with green, Up read as "good" while
 * other accents said nothing (WCAG 1.4.1, Use of Color). Now every verdict has its own glyph beside its word, so a greyscale copy still
 * reads; `tests/verdictMark.test.tsx` checks the glyphs are distinct. (A move up to RX shares Up's arrow and green: it is an Up vote,
 * and its pill says "Moved up to RX" everywhere, Progress, Overview and the Timeline, rather than a bare Up.) The Timeline's lane marks (end shapes and dashes) went with its lane drawing.
 *
 * Colour: Up and a move up to RX are a fixed green (--positive), Down the fixed destructive red, and the two neutral verdicts grey, so
 * a verdict looks the same whatever accent the athlete picks. Up used to take the accent, which with the red accent sat beside Down.
 * "Not tested since" was a hardcoded amber, the only chromatic value outside the theme's tokens; it is grey now, because it is "no
 * evidence", not a warning.
 */
export type VerdictKind = "up" | "down" | "not-tested-since" | "no-clear-change" | "move-up";

interface VerdictStyle {
  label: string;
  Glyph: LucideIcon;
  /** Pill background and text. */
  pill: string;
}

export const VERDICT_STYLE: Record<VerdictKind, VerdictStyle> = {
  up: {
    label: "Up",
    Glyph: ArrowUp,
    pill: "bg-positive-subtle text-positive",
  },
  "move-up": {
    label: "Moved up to RX",
    Glyph: ArrowUp,
    pill: "bg-positive-subtle text-positive",
  },
  down: {
    label: "Down",
    Glyph: ArrowDown,
    pill: "bg-destructive/10 text-destructive",
  },
  "not-tested-since": {
    label: "Not tested since",
    Glyph: CircleDashed,
    pill: "border border-border bg-muted text-foreground",
  },
  "no-clear-change": {
    label: "No clear change",
    Glyph: Minus,
    pill: "bg-muted text-muted-foreground",
  },
};

/** The verdict pill: glyph and word, so it reads without its colour. */
export function VerdictPill({ kind, className }: { kind: VerdictKind; className?: string }) {
  const style = VERDICT_STYLE[kind];
  const { Glyph } = style;
  return (
    <span
      data-verdict={kind}
      className={cn("ml-2 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold", style.pill, className)}
    >
      <Glyph className="size-3 shrink-0" strokeWidth={2.5} aria-hidden data-glyph={kind === "move-up" ? "up" : kind} />
      {style.label}
    </span>
  );
}

/** The Progress headline's colour, on Progress and on Overview's totals row: the verdict colours, so "Improving" reads like an Up. */
export function headlineLabelClass(label: string): string {
  if (label === "Improving") return "text-positive";
  if (label === "Declining") return "text-destructive";
  return "text-foreground";
}
