/**
 * Purely decorative background: a faint graph-paper grid plus a couple of
 * ghosted chart silhouettes (a line trend, scattered dots) sketched into it,
 * as if the shape of the story had already been half-drawn on the board
 * before the file landed. Shapes deliberately echo the dashboard's own chart
 * vocabulary (line/scatter — see ShareAreaChart, LiftChart) rather than
 * inventing new ones.
 *
 * Uses `currentColor` at low opacity only — no accent, no new hues. Stays
 * inside the achromatic-base rule in CLAUDE.md; the single accent the
 * athlete picks stays the only colour on the page.
 */
export function WhiteboardTexture() {
  return (
    <svg
      className="absolute inset-0 -z-10 size-full text-foreground"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="board-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1200" height="800" fill="url(#board-grid)" />

      {/* Ascending line trend, lower left — echoes ShareAreaChart. */}
      <polyline
        points="40,700 140,680 240,650 340,660 440,600 540,610 640,560"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.06"
        strokeWidth="2"
      />

      {/* Scattered PR dots, lower right — echoes LiftChart. */}
      {[
        [980, 640],
        [1030, 600],
        [1070, 660],
        [1110, 580],
        [1140, 630],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={5} fill="currentColor" opacity="0.06" />
      ))}
    </svg>
  );
}
