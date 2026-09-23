/**
 * Purely decorative background: a faint graph-paper grid, as if the board
 * had already been ruled before the file landed.
 *
 * Uses `currentColor` at low opacity only — no accent, no new hues. Stays
 * inside the achromatic-base rule in CLAUDE.md; the single accent the
 * athlete picks stays the only colour on the page.
 *
 * Deliberately has no `viewBox`: with one, the pattern's cells live in the
 * viewBox's coordinate space and get rescaled along with it whenever the
 * page's actual height changes (e.g. expanding "Don't have your export
 * yet?" grows the page) — the grid visibly ballooned. Without a viewBox,
 * 1 SVG unit is 1px, so cells stay a fixed 40px regardless of how tall the
 * page ends up; the `<rect>` just grows to match via percentage sizing.
 *
 * Faded out via a CSS mask rather than baked into the grid's own opacity,
 * so the fixed-pixel cells above stay untouched — the mask is the only
 * thing that scales with the container. Two axis-aligned gradients
 * (mask-composite: intersect) fade each edge independently, so the grid
 * stays full-strength across the middle 50% of the page and tapers out
 * over the outer quarter on every side — a rectangular taper, matching the
 * page's own shape, rather than an off-center ellipse.
 */
const EDGE_FADE_MASK =
  "linear-gradient(to right, transparent, black 25%, black 75%, transparent), " +
  "linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)";

export function WhiteboardTexture() {
  return (
    <svg
      className="absolute inset-0 -z-10 size-full text-foreground"
      style={{
        WebkitMaskImage: EDGE_FADE_MASK,
        WebkitMaskComposite: "source-in",
        maskImage: EDGE_FADE_MASK,
        maskComposite: "intersect",
      }}
      aria-hidden="true"
    >
      <defs>
        <pattern id="board-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#board-grid)" />
    </svg>
  );
}
