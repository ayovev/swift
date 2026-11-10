import { ArrowDown, ArrowUp, CircleDashed, Minus, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * How a verdict is marked, everywhere it is shown: the pill on Progress and Overview, and the lane on the Timeline.
 *
 * Shape and a glyph carry the verdict; colour only repeats it. Up used to be marked by the accent alone, so the colour of a verdict
 * was whatever the athlete picked for looks: with the red accent, Up and Down were both red, told apart only by a word at the far end
 * of the lane, and with green, Up read as "good" while other accents said nothing (WCAG 1.4.1, Use of Color). Now every verdict has
 * its own glyph and its own end mark, so a greyscale copy still reads, and `tests/verdictMark.test.tsx` checks that no two share both.
 *
 * Colour: Up and a move up to RX keep the accent (the athlete's one colour, for the thing that went their way); Down keeps the fixed
 * destructive red; the two neutral verdicts are grey. "Not tested since" was a hardcoded amber, the only chromatic value outside the
 * theme's tokens; it is grey with a dotted line now, because it is "no evidence", not a warning.
 */
export type VerdictKind = "up" | "down" | "not-tested-since" | "no-clear-change" | "move-up";

/** What sits at the recent end of a Timeline lane. */
export type EndMark = "dot" | "ring" | "diamond" | "small-dot";

interface VerdictStyle {
  label: string;
  Glyph: LucideIcon;
  /** Pill background and text. */
  pill: string;
  /** Lane line: colour, and a dash pattern for the verdicts that are not a measured change in the athlete's favour. */
  line: { color: string; dash: "solid" | "dashed" | "dotted" };
  end: EndMark;
  /** Colour of the end mark (a ring and a diamond draw their outline or fill in it). */
  endColor: string;
}

export const VERDICT_STYLE: Record<VerdictKind, VerdictStyle> = {
  up: {
    label: "Up",
    Glyph: ArrowUp,
    pill: "bg-accent-subtle text-accent-link",
    line: { color: "var(--accent-link)", dash: "solid" },
    end: "dot",
    endColor: "var(--accent-link)",
  },
  "move-up": {
    label: "Up",
    Glyph: ArrowUp,
    pill: "bg-accent-subtle text-accent-link",
    line: { color: "var(--accent-link)", dash: "solid" },
    end: "diamond",
    endColor: "var(--accent-link)",
  },
  down: {
    label: "Down",
    Glyph: ArrowDown,
    pill: "bg-destructive/10 text-destructive",
    line: { color: "var(--destructive)", dash: "dashed" },
    end: "ring",
    endColor: "var(--destructive)",
  },
  "not-tested-since": {
    label: "Not tested since",
    Glyph: CircleDashed,
    pill: "border border-border bg-muted text-foreground",
    line: { color: "var(--muted-foreground)", dash: "dotted" },
    end: "ring",
    endColor: "var(--muted-foreground)",
  },
  "no-clear-change": {
    label: "No clear change",
    Glyph: Minus,
    pill: "bg-muted text-muted-foreground",
    line: { color: "var(--muted-foreground)", dash: "solid" },
    end: "small-dot",
    endColor: "var(--muted-foreground)",
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

/** The glyph alone, for text that already names the verdict (a Timeline lane's "Up +15.4%"). */
export function VerdictGlyph({ kind, className }: { kind: VerdictKind; className?: string }) {
  const { Glyph } = VERDICT_STYLE[kind];
  return <Glyph className={cn("inline size-3 shrink-0 align-[-1px]", className)} strokeWidth={2.5} aria-hidden data-glyph={kind === "move-up" ? "up" : kind} />;
}

/** CSS for a lane line of the given dash: a 2px rule drawn as a border so dashed and dotted come free. */
export function laneLineStyle(kind: VerdictKind): CSSProperties {
  const { line } = VERDICT_STYLE[kind];
  return { borderTopWidth: 2, borderTopStyle: line.dash, borderTopColor: line.color };
}

/** The recent end of a lane, centred on its point. */
export function LaneEnd({ kind, left }: { kind: VerdictKind; left: string }) {
  const { end, endColor } = VERDICT_STYLE[kind];
  const base = "absolute top-1/2 -translate-x-1/2 -translate-y-1/2";
  const common = { left, ...(end === "ring" ? { borderColor: endColor } : { backgroundColor: endColor }) };
  if (end === "diamond") return <span data-end={end} className={cn(base, "size-2.5 rotate-45")} style={common} />;
  if (end === "ring") return <span data-end={end} className={cn(base, "size-2.5 rounded-full border-2 bg-background")} style={common} />;
  if (end === "small-dot") return <span data-end={end} className={cn(base, "size-1.5 rounded-full")} style={common} />;
  return <span data-end={end} className={cn(base, "size-2.5 rounded-full")} style={common} />;
}
