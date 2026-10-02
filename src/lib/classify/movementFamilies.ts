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
  { id: "clean", label: "Clean", members: ["clean", "power-clean", "hang-clean", "hang-power-clean", "squat-clean", "clean-pull", "clean-and-jerk", "power-clean-and-jerk"], generic: "clean" },
  { id: "snatch", label: "Snatch", members: ["snatch", "power-snatch", "hang-snatch", "hang-power-snatch", "squat-snatch", "snatch-pull", "muscle-snatch", "snatch-balance"], generic: "snatch" },
  { id: "jerk", label: "Jerk", members: ["jerk", "split-jerk", "push-jerk", "clean-and-jerk", "power-clean-and-jerk"], generic: "jerk" },
  { id: "squat", label: "Squat", members: ["squat", "back-squat", "front-squat", "overhead-squat", "goblet-squat"], generic: "squat" },
  { id: "press", label: "Press", members: ["press", "shoulder-press", "push-press"], generic: "press" },
  { id: "deadlift", label: "Deadlift", members: ["deadlift", "sumo-deadlift", "snatch-grip-deadlift"], generic: "deadlift" },
  { id: "pull-up", label: "Pull-up", members: ["pull-ups", "chest-to-bar", "chin-ups"] },
  { id: "muscle-up", label: "Muscle-up", members: ["muscle-ups", "bar-muscle-ups", "ring-muscle-ups"] },
  { id: "push-up", label: "Push-up", members: ["push-ups", "pike-push-ups"] },
  { id: "handstand", label: "Handstand", members: ["handstand-work", "handstand-walk", "handstand-hold", "handstand-push-ups"] },
  { id: "dip", label: "Dip", members: ["dips", "ring-dips"] },
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
