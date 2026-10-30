import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Audience } from "@/lib/audience";

interface SplashProps {
  onChoose: (audience: Audience) => void;
}

const SIDES: {
  audience: Audience;
  title: string;
  body: string;
  cta: string;
  className: string;
  ctaClassName: string;
}[] = [
  {
    audience: "athlete",
    title: "I train.",
    body: "See what your training history adds up to: how often you showed up, what got heavier, and what your PRs look like.",
    cta: "Continue as an athlete",
    className: "bg-black text-white focus-visible:outline-white",
    ctaClassName: "group-hover:bg-white group-hover:text-black group-focus-visible:bg-white group-focus-visible:text-black",
  },
  {
    audience: "coach",
    title: "I coach.",
    body: "Review an athlete's training from the export they send you. Their file stays in your browser.",
    cta: "Continue as a coach",
    className: "bg-white text-black focus-visible:outline-black",
    ctaClassName: "group-hover:bg-black group-hover:text-white group-focus-visible:bg-black group-focus-visible:text-white",
  },
];

/** How long the chosen side takes to fill the screen before the page behind it appears. */
const TAKEOVER_MS = 450;

// How much of the screen each side gets: even at rest, a little more for the
// side being pointed at, all of it for the side that was picked.
function grow(side: Audience, hovered: Audience | null, chosen: Audience | null): number {
  if (chosen) return chosen === side ? 1 : 0;
  if (hovered) return hovered === side ? 1.5 : 1;
  return 1;
}

function prefersReducedMotion(): boolean {
  // No matchMedia (jsdom) means no animation to wait for.
  return typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The first-visit split screen. Fixed black and white in both modes on purpose:
 * it is the one place the page is not themed, so the accent and the light/dark
 * choice do not change which side is which. Each half is one button, so the
 * whole panel is the target.
 *
 * The motion is all `flex-grow` and colour: a side widens when pointed at or
 * focused, and the one picked fills the screen before the upload page replaces
 * it. With reduced motion the choice applies immediately and nothing moves.
 */
export function Splash({ onChoose }: SplashProps) {
  const [hovered, setHovered] = useState<Audience | null>(null);
  const [chosen, setChosen] = useState<Audience | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function choose(audience: Audience) {
    if (chosen) return;
    if (prefersReducedMotion()) return onChoose(audience);
    setChosen(audience);
    timer.current = window.setTimeout(() => onChoose(audience), TAKEOVER_MS);
  }

  return (
    <div
      role="group"
      aria-label="Choose how you'll use Swift"
      className="flex min-h-svh flex-col overflow-hidden md:flex-row"
    >
      {SIDES.map((side) => {
        const dismissed = chosen !== null && chosen !== side.audience;
        return (
          <button
            key={side.audience}
            type="button"
            onClick={() => choose(side.audience)}
            onMouseEnter={() => setHovered(side.audience)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(side.audience)}
            onBlur={() => setHovered(null)}
            style={{ flexGrow: grow(side.audience, hovered, chosen) }}
            className={`group flex min-h-0 min-w-0 basis-0 flex-col items-start justify-center gap-4 overflow-hidden px-8 py-10 text-left outline-offset-[-6px] focus-visible:outline-2 motion-safe:transition-[flex-grow] motion-safe:duration-500 motion-safe:ease-out sm:px-14 md:px-16 lg:px-24 ${side.className}`}
          >
            <span
              className={`flex shrink-0 flex-col items-start gap-4 md:w-[26rem] motion-safe:transition-opacity motion-safe:duration-300 ${dismissed ? "opacity-0" : ""}`}
            >
              <span className="text-5xl font-semibold tracking-tight sm:text-6xl">{side.title}</span>
              <span className="max-w-sm text-pretty text-base leading-relaxed opacity-80 md:min-h-[6.5rem]">
                {side.body}
              </span>
              <span
                className={`mt-2 inline-flex items-center gap-2 rounded-full border border-current px-4 py-2 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200 ${side.ctaClassName}`}
              >
                {side.cta}
                <ArrowRight
                  className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
