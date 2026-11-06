# Real-export check

**Status: written and run once on the athlete's own export (2026-11-06); see "First run" below.** A local script that runs the A1 rules on an athlete's own SugarWOD export (and
optionally an InBody export) and prints what the spec's thresholds do on that data. It is the only validation the thresholds will
get: the bundled sample is one synthetic-extended athlete, and the one real export is not in the repo. It covers cases A1-MAN-01 and
A1-MAN-02 and the checks the later decisions added.

## Running it

```
SWIFT_EXPORT=/path/to/sugarwod-export.csv npm run check:export
```

Optional environment variables:

| Variable | Meaning |
| --- | --- |
| `SWIFT_INBODY` | Path to an InBody export. Adds the body-context coverage check. |
| `SWIFT_AS_OF` | `YYYY-MM-DD`. The reference date for recency; today by default. |
| `SWIFT_NAMES=1` | Show lift and benchmark names. They are training content, so they are hidden by default. |
| `SWIFT_ENTRIES` | Timeline entries to test, `Name\|start\|end` separated by `;`, with `ongoing` for no end, for example `Spring cut\|2026-03-01\|2026-05-24;Current block\|2026-07-01\|ongoing`. |

The report is printed and written to `.vitest/real-export-report.txt`, which git ignores. Nothing is sent anywhere: the script reads
the files you name and prints. **Keep the export itself out of the repository** (a `private/` folder is git-ignored for it); the
check never copies it.

Implementation: `scripts/realExportCheck/` (`a1.ts` the A1 rules, `analysis.ts` the checks, `report.ts` the text) run through
`tests/realExportCheck.test.ts`. The same test file pins the reference implementation to the spec's figures for the bundled sample
(45 subjects; 8 up, 1 down, 5 no clear change, 11 fewer than 6, 20 not recent; "Improving in 8 of 14"; 272 of 526 weight entries
unused, 210 with no readable scheme, 15 outside 1 to 8 reps, 47 no lift named; 89 of 246 lift sessions as max efforts), and checks
that its lift builder produces the same entries as the app's `buildLiftSubjects`. `npm test` runs those and skips the real-export part.

## What each section tells you, and what to look for

| Section | What it measures | The sample's figure | Act if the real export shows |
| --- | --- | --- | --- |
| 1. What was read | Subjects, sessions per subject, and why Load rows went unused | 45 subjects; 272 of 526 unused | A much larger unused share than about half: the rep-scheme rule (1 to 8) is leaving out most of the athlete's lifting |
| 2. Verdicts today | The six groups and the headline | 8 / 1 / 0 / 5 / 11 / 20; Improving in 8 of 14 | Almost everything in "Fewer than 6 sessions": the gate is too strict for this athlete's logging |
| 3. Stability | How often one more session changes a verdict, and the verdict rule applied to the same values shuffled in time | 29% of cases change; shuffled history reads Up 31%, real history Up 50% | Changes well above about a third, or a real Up share no higher than the shuffled one: the 5% and record thresholds are too loose for this athlete |
| 4. Units and estimates | The largest estimated 1RM per lift in the file's units | 365 lb at most | A lift logged in kilograms that looks about 2.2 times too small: the export is not in pounds (A1-MAN-02) |
| 5. Merging RX and Scaled | Lifts logged both ways, and what a merge would change | 2 lifts, nothing changes | Many lifts logged both ways, or verdicts that change: the merge question deserves reopening |
| 6. Body context | With an InBody file: the share of verdict rows with body weight near both bests, and the scan spacing | not measurable (synthetic scans) | Most rows reading "No body weight within 21 days": the line will be mostly empty until weigh-ins exist |
| 7. Timeline entries | For entries you name, how many subjects reach a before and after | 3 of the 8 demo entries reach a verdict | Few entries reaching 3 subjects: the facts lines carry most of the value |

The shuffle test is the one new check. It keeps each subject's dates and shuffles its values 200 times with a fixed seed, so a rule that
cannot tell real change from noise says Up about as often on shuffled history as on the real one. A rule that is working says Up more
often on the real history.

## What it does not do

- It does not run the flat-athlete simulation behind the spec's false-Up figures; the shuffle test is its version on the athlete's own data.
- It does not read manual weigh-ins (not built) or the browser's saved timeline entries; entries are passed in by hand.
- It reports; it never changes a threshold. A finding goes back into the spec as a decision.

## First run: the athlete's own export (2026-11-06)

A SugarWOD export of 1,279 rows (2022-11-21 to 2026-11-04) and an InBody export of 9 scans. **The workouts file contains every unique row of
the bundled sample plus 70 newer ones, so it is the same athlete as the sample, two months later.** The run is therefore not an independent
check: the thresholds are still validated on one athlete. Figures only; no names or training content are recorded here, and the export was
not copied into the repository.

| Check | Result |
| --- | --- |
| Subjects | 45; 14 with 6 or more sessions |
| Groups | Up 9 (2 move-ups to RX), Down 1, Not tested since 2, No clear change 4, Fewer than 6 sessions 13, Not recent 16 |
| Headline | Improving in 9 of 14 lifts and benchmarks (4 no clear change, 1 down) |
| Load rows unused | 277 of 571 (49%): 212 no readable rep scheme, 15 outside 1 to 8 reps, 50 no lift named |
| Max efforts | 91 of 286 lift sessions (32%) |
| Stability | one more session changed the verdict in 50 of 173 cases (29%), the same as the sample |
| Shuffle test | real history Up 50%, Down 7%, Not tested since 14%; the same values shuffled in time Up 34%, Down 14%, Not tested since 8% |
| RX and Scaled for lifts | 2 lifts logged both ways, 1 Scaled session each; merging changes nothing, so the question cannot be settled on this data |
| Body context (9 InBody scans, median gap 120 days) | 3 of 14 verdict rows have body weight near both bests; 11 would read "No body weight within 21 days"; none of the 3 moved past the 3 lb band |

**Confirmed by the athlete:** the largest estimated 1RMs are in pounds (A1-MAN-02), and the two lifts that read Not tested since are
mid-cycle with no max effort yet, which is the case the state is for.

**What it shows**
- **The verdict rules behave on the athlete's real history as they did on the sample:** the stability figure is unchanged at 29%, the new
  sessions moved some subjects between groups (two lifts became Not tested since) and the headline moved from 8 of 14 to 9 of 14.
- **Up separates from noise, modestly.** 50% against 34% shuffled is a 16 point gap on 14 subjects. About a third of shuffled histories
  read Up, because three of the seven sized Ups are record-only (+2.5% to +3.0%): the record rule's cost, already known from the
  flat-athlete simulation, now seen on real data.
- **The body-context line will be mostly empty on InBody alone.** Scans months apart reach both bests for about a fifth of rows. This is the
  case for manual weigh-ins.
- **Open:** thresholds on a second athlete, and the RX and Scaled merge for lifts, which needs an athlete who logs Scaled lifts.
