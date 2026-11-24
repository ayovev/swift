# The movement lexicon

Developer reference, extracted from CLAUDE.md so that file stays short. CLAUDE.md keeps the rules that apply everywhere and points here for the detail; read this before changing `movementLexicon.ts`, `movementFamilies.ts`, `implement.ts` or how a movement is read from a workout. Back to the [README](../README.md).

Everything here is about how a workout's movements are identified for the M/W/G split and the Movements view. The matching engine itself, and the rules that apply to both classifiers, are in CLAUDE.md. How classification works for a reader is in [classification.md](classification.md).

Movements have **stable ids**, not just labels: every `MOVEMENT_LEXICON` entry carries an `id`
(kebab-case, shared by all aliases of one movement, one label and one modality per id — pinned in
`tests/modalityClassifier.test.ts`), and `MovementHit` carries it. Anything that stores or filters by
movement uses the id; labels are display text and may be reworded. `movementFamilies.ts` groups ids
("Clean" = clean, power clean, hang clean, ...) as a deliberate list, never a prefix match, so a new
lexicon entry cannot silently join a family. `parseRows()` runs `findMovements` once per row into
`ParsedRow.movements`, and `buildModalityData` classifies from that rather than re-reading the text.
**`barbell_lift` outranks the text.** It is the one column that names a movement as data, so
`findRowMovements()` (`classifyModality.ts`) reads it first through the same lexicon (aliases and spellings
resolve to the same ids, no separate table) and those hits come first, tagged `source: "barbell_lift"`. The text is
still searched for other movements, but a family's *generic* bare word (`MovementFamily.generic`: "squat",
"clean", "snatch", ...) is dropped when the typed lift is a more specific member of that family, so a front squat
session is not also a vague squat. Rows with no recognized typed lift behave exactly as before. Measured on the
sample: 279 of 1,209 rows have the field, 25 rows' identities changed and no modality split moved (all typed lifts
are W). A lift named only as the base of a percentage ("75% of snatch") is not read as that movement: see the next paragraph.
**Variants are their own ids, and their family keeps them.** CrossFit's movement list separates strict, kipping and
butterfly pull-ups, the GHD movements, legless and L-sit rope climbs, walking and front-rack lunges and so on, so each
is a lexicon id (`strict-pull-ups`) and a member of its family (`pull-up`); picking the family still finds every variant,
picking the plain `pull-ups` id finds only the unqualified ones. The longer phrase wins the range, which also ends the
double count (`chest-to-bar pull-ups` is one movement, not `chest-to-bar` plus `pull-ups`). A variant phrase must
carry any suffix a shorter phrase could claim (`strict chest-to-bar pull-up`), or the shorter one claims the range
first and the qualifier is lost. A prefixed complex stays split into its parts via `exclude` (`power clean and push
jerk` is not a `clean-and-push-jerk`). Measured on the sample: 117 rows' movements changed and 40 modality splits
moved, from three causes: double counts merged (9), `single-leg squat` read as a pistol and so G rather than W (13),
and variants newly recognized (18). Dumbbell and kettlebell versions of lifts are deliberately **not** separate ids:
that is an implement axis, not 14 more ids that duplicate the barbell ones.
A double count is found by auditing the sample for two different movements whose matched text touches (or sits a
few letters apart) in one row, then asking whether the sport names that as one movement: a farmers carry, a burpee
pull-up, a snatch deadlift, a clean grip deadlift, a squat clean & jerk and a lateral burpee bar step-over are, so
each is one entry whose longer phrase claims the range. A complex written with `+` ("clean + front squat") and glued
lines are several movements and stay several. Left as two on purpose and pinned in `tests/modalityClassifier.test.ts`:
burpee deadlifts, squat clean thrusters and wall ball sit-ups. Measured on the sample: 30 rows' movements changed and
17 splits moved (farmers carry 13 rows no longer also a loaded carry; burpee pull-ups; a lateral burpee bar step-over
moves from W to G; a hyphenated `bent-over rows` stops reading as a rower, M to W).
Movement and family labels are in sentence case (pinned in `tests/modalityClassifier.test.ts`); a name keeps its capitals
(`GHD`, `AbMat`, `L-sit`, `Turkish`). Inside a sentence use `labelInSentence()` (`buildMovementData.ts`), which lowers only the
first letter and only when it starts an ordinary word, never `toLowerCase()`, which turned `Hanging L-sit` into `hanging l-sit`.
A brand or a pace is not a movement: `assault bike` and `echo bike` are aliases of `bike`, and `sprint` is an alias of `run` (a
workout naming both counts the movement once). The aliases keep the phrase the workout used for the "matched on" text.
A sprint on a bike or rower would also read as a run; no exclusion is added until a real export shows one. Measured on
the sample: 7 rows' movements changed and 4 splits moved, all from two ids merging into one.
Bare equipment words (`db`, `kb`, `dumbbell`, `kettlebell`) are deliberately **not** lexicon entries: they name the
implement, not the movement, and counting them inflated W.
**Implement is a label on a movement, not a movement.** `MovementHit.implement` (`barbell | dumbbell | kettlebell`,
absent when the workout does not say, which is not "bodyweight") is read by `implement.ts` from the words written
directly before the first mention of a movement: at most two plain words between, and nothing else. SugarWOD glues
lines together, so a digit or punctuation mark, another claimed movement in between (`dumbbell squatsbar-facing
burpees`), or a hyphen straight after the implement (`db-facing burpees`) all end it. An implement named once for a
list is not carried forward. A lexicon entry defined by its implement (`kettlebell-swing`, `dumbbell-row`,
`barbell-row`) carries it as `MovementEntry.implement`, and what is written outranks it. A lift from the `barbell_lift`
field is barbell. It never adds a movement and never moves a modality split. The Movements view narrows a selection
with `MovementSelection.implement` (the "Implement" control appears only when a workout names one for the selection;
`implement_selected` is the value-free analytics name). Measured on the sample: 127 dumbbell, 66 kettlebell and 6
barbell labels from the text (one of the dumbbell labels is a stray "carry" in "use two dbs for the carry").

## Skills

The Skills report (`docs/reports.md`) counts a movement toward a skill, and the decision lives on the lexicon's own entries so there is one list. `MovementEntry.skill` is a `SkillRef` from the `SKILLS` table at the top of `movementLexicon.ts` (`skill: SKILLS.pullUps`), or `null` for "decided, not a skill". Absent means no decision, which is fine for a movement no skill is near. A skill's label and level are defined once in `SKILLS` and referenced, never retyped, and `skills.ts` derives the report's list from the entries.

What to do when you add a movement:

- **A new alias of an existing movement:** copy the other aliases' `skill`. Every alias of one id carries the same value (`tests/skills.test.ts`).
- **A new variant in a family that has a skill** (a new muscle-up, a new pull-up): `tests/skills.test.ts` fails until you give it `skill: SKILLS.x` (it counts toward that skill) or `skill: null` (it does not). The test is the reminder; nothing else needs updating.
- **Deciding for a variant:** the rule considered was "a variant counts when it is the same movement at equal or greater difficulty, and an easier, assistive or different movement does not". It was applied to the 38 family-mates of a skill, and the owner chose to count none of them for now (the candidates were `split-clean`, `l-pull-ups`, `toes-to-rings`, the grip deadlifts, the lunge variants, `ring-push-ups` and a few more), so each carries `skill: null` and a variant counts only when it is listed under the skill. A combined movement (`power-clean-and-jerk`, `burpee-pull-ups`) is several movements and stays `skill: null`. Flip a `null` to a skill only as a deliberate change here.
- **A movement that is a skill of its own:** add it to `SKILLS` with its level, and reference it. A skill's movements must share one modality.
- **Anything else:** leave `skill` off.

Levels are a judgment, not computed from the sample. A skill never changes how a workout is matched, so none of this moves the parity fixture.
