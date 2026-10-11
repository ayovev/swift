import type { MovementHit } from "@/types/modality";

/**
 * Groups of related movements, so a view can offer "Clean" and mean every way
 * a clean was done. Members are movement ids (`MovementEntry.id`), never
 * labels or phrases.
 *
 * A family only exists where an athlete would expect picking one to include
 * the others. Single-member groups are pointless and a test rejects them.
 * A movement may sit in more than one family: Clean & jerk is both a clean
 * and a jerk. Families may cross modalities where the sport does (a muscle-up
 * is a muscle-up whichever way it is done) but squats are deliberately split:
 * a loaded squat and an air squat are different questions about training.
 *
 * Membership is a deliberate list, not a prefix match on the id, so adding a
 * lexicon entry never silently joins a family.
 */
export interface MovementFamily {
  id: string;
  /** Shown to the athlete. */
  label: string;
  members: readonly string[];
  /**
   * The bare-word member ("squat", "clean"), for families where that word is
   * what noise produces. When SugarWOD's own `barbell_lift` names a more
   * specific lift in the family, the generic hit from the text is dropped.
   */
  generic?: string;
}

export const MOVEMENT_FAMILIES: readonly MovementFamily[] = [
  { id: "clean", label: "Clean", members: ["clean", "power-clean", "hang-clean", "hang-power-clean", "squat-clean", "clean-pull", "medicine-ball-clean", "split-clean", "clean-and-jerk", "power-clean-and-jerk", "clean-and-push-jerk", "hang-clean-and-push-jerk", "power-clean-and-split-jerk", "squat-clean-and-jerk"], generic: "clean" },
  { id: "snatch", label: "Snatch", members: ["snatch", "power-snatch", "hang-snatch", "hang-power-snatch", "squat-snatch", "snatch-pull", "muscle-snatch", "snatch-balance", "split-snatch"], generic: "snatch" },
  { id: "jerk", label: "Jerk", members: ["jerk", "split-jerk", "push-jerk", "clean-and-jerk", "power-clean-and-jerk", "clean-and-push-jerk", "hang-clean-and-push-jerk", "power-clean-and-split-jerk", "squat-clean-and-jerk"], generic: "jerk" },
  { id: "squat", label: "Squat", members: ["squat", "back-squat", "front-squat", "overhead-squat", "goblet-squat", "zercher-squat"], generic: "squat" },
  { id: "press", label: "Press", members: ["press", "shoulder-press", "push-press", "sots-press"], generic: "press" },
  { id: "deadlift", label: "Deadlift", members: ["deadlift", "sumo-deadlift", "snatch-grip-deadlift", "clean-grip-deadlift"], generic: "deadlift" },
  { id: "pull-up", label: "Pull-up", members: ["pull-ups", "strict-pull-ups", "kipping-pull-ups", "butterfly-pull-ups", "l-pull-ups", "chest-to-bar", "strict-chest-to-bar", "kipping-chest-to-bar", "burpee-pull-ups", "chin-ups"] },
  { id: "muscle-up", label: "Muscle-up", members: ["muscle-ups", "strict-muscle-ups", "kipping-muscle-ups", "bar-muscle-ups", "strict-bar-muscle-ups", "kipping-bar-muscle-ups", "ring-muscle-ups"] },
  { id: "push-up", label: "Push-up", members: ["push-ups", "ring-push-ups", "pike-push-ups"] },
  { id: "handstand", label: "Handstand", members: ["handstand-work", "handstand-walk", "handstand-hold", "handstand-pirouette", "straddle-press-to-handstand", "handstand-push-ups", "strict-handstand-push-ups", "kipping-handstand-push-ups", "deficit-handstand-push-ups", "freestanding-handstand-push-ups", "chest-to-wall-handstand-push-ups"] },
  { id: "dip", label: "Dip", members: ["dips", "ring-dips"] },
  { id: "toes-to-bar", label: "Toes-to-bar", members: ["toes-to-bar", "strict-toes-to-bar", "kipping-toes-to-bar", "toes-to-rings"] },
  { id: "sit-up", label: "Sit-up", members: ["sit-ups", "abmat-sit-ups", "ghd-sit-ups"] },
  { id: "ghd", label: "GHD", members: ["ghd-work", "ghd-sit-ups", "ghd-back-extensions", "ghd-hip-extensions", "ghd-hip-and-back-extensions"] },
  { id: "rope-climb", label: "Rope climb", members: ["rope-climbs", "legless-rope-climbs", "l-sit-rope-climbs"] },
  { id: "l-sit", label: "L-sit", members: ["l-sit", "hanging-l-sit", "l-sit-on-rings", "l-sit-to-shoulder-stand"] },
  { id: "burpee", label: "Burpee", members: ["burpees", "inverted-burpees", "burpee-pull-ups", "burpee-box-jump-overs", "lateral-burpee-bar-step-overs"] },
  { id: "lunge", label: "Lunge", members: ["lunge", "walking-lunges", "front-rack-lunges", "overhead-walking-lunges"] },
  { id: "bike", label: "Bike", members: ["bike", "assault-bike", "echo-bike"] },
  { id: "run", label: "Run", members: ["run", "shuttle-run", "sprint"] },
  { id: "jump-rope", label: "Jump rope", members: ["double-unders", "single-unders", "jump-rope"] },
  { id: "carry", label: "Carry", members: ["loaded-carry", "farmer-carry"] },
];

/** Ids of every family a movement belongs to (none for most movements). */
export function familiesOf(movementId: string): string[] {
  return MOVEMENT_FAMILIES.filter((f) => f.members.includes(movementId)).map((f) => f.id);
}

/** Does a workout's movement list include `familyId` (any member counts)? */
export function hasFamily(movements: readonly MovementHit[], familyId: string): boolean {
  const family = MOVEMENT_FAMILIES.find((f) => f.id === familyId);
  return family !== undefined && movements.some((m) => family.members.includes(m.id));
}

/** Does a workout's movement list include this exact movement? */
export function hasMovement(movements: readonly MovementHit[], movementId: string): boolean {
  return movements.some((m) => m.id === movementId);
}
