import wordmarkLight from "@/assets/wordmark-light.svg";
import wordmarkDark from "@/assets/wordmark-dark.svg";
import { cn } from "@/lib/utils";

/** The Swift wordmark. Two pre-rendered variants, swapped by the app's own light/dark class. */
export function SwiftMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <img src={wordmarkDark} alt="Swift" className="h-8 w-auto dark:hidden" />
      <img src={wordmarkLight} alt="Swift" className="hidden h-8 w-auto dark:block" />
    </div>
  );
}
