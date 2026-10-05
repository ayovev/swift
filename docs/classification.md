# How classification works

Back to the [README](../README.md).

Both classifiers read the same input: the workout's `title`, `description` and `barbell_lift` fields concatenated and lowercased. That is all they see. There is no lookup table of known workouts and no model — it is keyword and phrase matching over free text.

Matching is plain substring containment by default, not word-boundary matching. This is deliberate: SugarWOD descriptions frequently concatenate lines with no separator at all (`21-15-9DeadliftsPull-ups-200m run after each round`), so the character before a genuine movement name is often a letter, and a boundary rule would silently drop real matches. The cost is the occasional false positive, which a small measured exclusion list handles surgically (`carry` inside `carryover`, `press` inside `pressure`). Very short abbreviations like `du` or `kb` opt into a stricter token mode instead.

Substring matching also gets most inflections for free — `run` finds `runs` and `running`, `press` finds `presses`. The one case it cannot reach is where the stem itself changes, so the matcher additionally searches the English consonant-plus-`y` → `i` form of every keyword: `carry` finds `carries` and `carried`, `heavy` finds `heavier` and `heaviest`. That is a rule in one place rather than plural spellings scattered through the keyword lists, so it holds for exports this project has never seen.

**The ten GPP domains** — Cardiovascular/Respiratory Endurance, Stamina, Strength, Flexibility, Power, Speed, Coordination, Agility, Balance, Accuracy — each have a keyword list, and a workout hits a domain if any of that domain's keywords appear in its text. **Domains are not mutually exclusive**: most workouts hit several, which is the point. Because of that overlap, a single month's domain percentages sum to well over 100%, so the normalized stacked chart divides by total tags rather than total workouts. Swift keeps the specific keyword that triggered each match and shows it in the per-domain drill-down, so you can always check the reasoning. Keyword order within each list matters — the first keyword that hits is the one reported to you.

**The M/W/G modality mix** is proportional rather than a single label, and it follows canonical CrossFit semantics:

- **M — Metabolic conditioning**: monostructural work only. Running, rowing, biking, skiing, jumping rope. Not "anything that makes you breathe hard".
- **W — Weightlifting**: an external load moved by you. Barbell, dumbbell, kettlebell, odd objects.
- **G — Gymnastics**: your own bodyweight moved through space.

Each distinct movement named in a workout contributes equal weight to its modality, and a movement counts once however many times it appears. So Fran (thrusters and pull-ups) is 50% weightlifting / 50% gymnastics / 0% cardio — punishing metabolically, but with nothing monostructural in it. The three shares are rounded by largest remainder so they always sum to exactly 100. Movement phrases are claimed longest-first, so `power clean` beats bare `clean`, `air squat` (G) beats bare `squat` (W), and `ring row` (G) beats bare `row` (M) — adding a movement to the lexicon never requires re-tuning the order of anything else. Workouts where no movement is recognised at all are reported as unclassified and excluded from every average rather than counted as zeroes, and the dashboard footer says how many those were.

**This is a heuristic, not ground truth.** It is automated inference over free text your gym wrote, so a workout can land somewhere surprising if things are named unusually. Flexibility in particular reads low for almost everyone, because mobility work rarely gets logged as its own entry — not because nobody stretches. Every tab shows what it matched on so you can judge for yourself.
