import { useMemo } from "react";
import type { LiftRelativeStrength, RelativeStrengthResult } from "@/lib/analytics/relativeStrength";
import type { AlignmentResult } from "@/types/alignment";
import type { PlateauInsight } from "@/types/plateau";
import { AlignmentSummary } from "./AlignmentSummary";
import type { BodyCompState } from "./BodyCompTab";
import { InBodyUploadPrompt } from "./InBodyUploadPrompt";
import { PlateauSection } from "./PlateauSection";
import { StrengthSection } from "./StrengthSection";

interface LiftsTabProps {
  /** null until both a SugarWOD upload and an InBody upload are ready. */
  plateauInsights: PlateauInsight[] | null;
  /** The whole-athlete rollup of `plateauInsights`; null exactly when `plateauInsights` is. */
  alignment: AlignmentResult | null;
  /** Behind the same gate as `plateauInsights`, so null exactly when it is. */
  relativeStrength: RelativeStrengthResult | null;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
}

/**
 * Everything about how your lifts are moving, against your body composition:
 * the whole-athlete alignment read, then one plateau row per lift or named
 * benchmark, then each lift's estimated 1RM per unit of body mass. The three
 * come from separate calculations that share one lift grouping and one
 * upload gate, so this view owns that gate — one upload prompt, not one per
 * section — and each section renders only its own result.
 */
export function LiftsTab({ plateauInsights, alignment, relativeStrength, bodyComp, onBodyCompFile }: LiftsTabProps) {
  const strengthByLift = useMemo(
    () =>
      new Map<string, LiftRelativeStrength>(
        (relativeStrength?.lifts ?? []).map((l) => [`${l.lift}:${l.rxStatus}`, l])
      ),
    [relativeStrength]
  );

  if (!plateauInsights) {
    return (
      <InBodyUploadPrompt state={bodyComp} onFile={onBodyCompFile}>
        Checks your lifts and named benchmarks against your InBody history, so a stalled number
        can be told apart from a body-composition one, and divides each lift's estimated one-rep
        max by your bodyweight and lean mass, so a heavier lift can be told apart from a heavier
        athlete. Needs an InBody export in addition to the SugarWOD log already loaded.
      </InBodyUploadPrompt>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {alignment ? <AlignmentSummary alignment={alignment} /> : null}

      <section aria-labelledby="lifts-plateaus" className="flex flex-col gap-4">
        <h2 id="lifts-plateaus" className="text-base font-semibold">
          Plateaus
        </h2>
        <PlateauSection plateauInsights={plateauInsights} strengthByLift={strengthByLift} />
      </section>

      {relativeStrength ? (
        <section aria-labelledby="lifts-strength" className="flex flex-col gap-4">
          <h2 id="lifts-strength" className="text-base font-semibold">
            Strength per body mass
          </h2>
          <StrengthSection relativeStrength={relativeStrength} />
        </section>
      ) : null}
    </div>
  );
}
