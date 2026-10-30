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
}[] = [
  {
    audience: "athlete",
    title: "I train.",
    body: "See what your training history adds up to: how often you showed up, what got heavier, and what your PRs look like.",
    cta: "Continue as an athlete",
    className: "bg-black text-white focus-visible:outline-white",
  },
  {
    audience: "coach",
    title: "I coach.",
    body: "Review an athlete's training from the export they send you. Their file stays in your browser.",
    cta: "Continue as a coach",
    className: "bg-white text-black focus-visible:outline-black",
  },
];

/**
 * The first-visit split screen. Fixed black and white in both modes on purpose:
 * it is the one place the page is not themed, so the accent and the light/dark
 * choice do not change which side is which. Each half is one button, so the
 * whole panel is the target.
 */
export function Splash({ onChoose }: SplashProps) {
  return (
    <div
      role="group"
      aria-label="Choose how you'll use Swift"
      className="grid min-h-svh grid-rows-2 md:grid-cols-2 md:grid-rows-1"
    >
      {SIDES.map((side) => (
        <button
          key={side.audience}
          type="button"
          onClick={() => onChoose(side.audience)}
          className={`group flex flex-col items-start justify-center gap-4 px-8 py-10 text-left outline-offset-[-6px] focus-visible:outline-2 sm:px-14 md:px-16 lg:px-24 ${side.className}`}
        >
          <span className="text-5xl font-semibold tracking-tight sm:text-6xl">{side.title}</span>
          <span className="max-w-sm text-pretty text-base leading-relaxed opacity-80 md:min-h-[6.5rem]">
            {side.body}
          </span>
          <span className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
            {side.cta}
            <ArrowRight
              className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </button>
      ))}
    </div>
  );
}
