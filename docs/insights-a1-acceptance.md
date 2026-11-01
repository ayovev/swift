# A1 acceptance cases

**Status: draft for review, nothing built.** These are the acceptance cases for the A1 specification
([`insights-a1-spec.md`](insights-a1-spec.md)), written so each can become a test: exact inputs, exact outputs.
They replace the scattered case lists that used to sit in the spec. Every expected value for the verdict
cases was computed by a throwaway reference implementation of the rules (not committed) so none is a guess; the
cases marked **pending** record current behaviour that the writing exposed as questionable (see "Open points"
at the end).

## Conventions

- **Reference date** is 2026-09-11 unless a case says otherwise. It is always an input, never the clock.
- **Sessions** are written `date value`. For lifts the value is the **estimated 1RM in pounds**, supplied
  directly, so a verdict case does not depend on the estimator (the estimator has its own cases). `*` marks a
  max effort (the workout text names an explicit rep max or a rep ladder). Benchmarks are in seconds, shown as
  `m:ss`. A subject is RX unless a case says otherwise.
- **Rounding.** A percentage is rounded half away from zero to one decimal before it meets a threshold.
  Pounds are rounded half away from zero to a whole pound. Times to the second.
- **A verdict has these outputs:** `state` (`up`, `no clear change`, `not tested since`, `down`, `not enough
  sessions`, `not recent`), `change` (signed, one decimal), `N` (sessions per side), `previous` and `recent`
  (first month, last month, best), `record` (the session and its gain, or none), `lastTested` (date and value, or
  none), and the displayed strings.
- **A label** follows from the counted subjects: `Improving` when `4 × (up − down) ≥ counted` and `3 × up ≥
  counted`; `Declining` is the mirror; otherwise `Holding steady`. Fewer than 3 counted gives no label.

## Sessions and values (SES)

**A1-SES-01 Same-day entries collapse.** Given RX Deadlift entries 2025-01-10 195; 2025-02-07 188; 2025-03-07 190
and 200 (two entries the same day); 2025-04-04 202; 2025-05-02 204; 2025-06-06 206. Then there are 6 sessions
(not 7), the session on 2025-03-07 has value 200, and the subject is eligible (`n` = 6).

**A1-SES-02 Estimated 1RM.** Given a single at 200 lb, 3 reps at 225 lb and 5 reps at 165 lb. Then the values are
200.0, 242.9 and 189.1 (the average of Epley and Brzycki: 225 × 1.1 = 247.5 and 225 × 36 ÷ 34 = 238.2; 165 × 1.1667
= 192.5 and 165 × 36 ÷ 32 = 185.6).

**A1-SES-03 Rep-scheme range.** Given 8 reps at 225 lb, 9 reps at 225 lb and a row whose text names no readable rep
scheme. Then the 8-rep row is a session (282.2), and the other two are not sessions and are counted under unused
weight entries in "How this was counted".

**A1-SES-04 Different schemes compare.** Given a single at 200 lb and 3 reps at 185 lb. Then the values are 200.0 and
199.7, so a verdict comparing them reads `no clear change`.

**A1-SES-05 A row naming no lift is not a subject.** Given a Load row whose `barbell_lift` is empty and whose title
matches no known lift. Then it is counted as unused ("no lift named") and appears in no series.

**A1-SES-06 Benchmarks use the better score.** Given Fran entries on one day of 7:40 (460 s) and 7:36 (456 s). Then
the session value is 456 s (lower is better).

**A1-SES-07 RX and Scaled are separate subjects.** Given Fran with RX and Scaled sessions. Then each status has
its own sessions, window, verdict and counts, and no session is shared.

## Verdicts (VRD)

**A1-VRD-01 Too few sessions.** Given 5 sessions of one lift. Then `state` is `not enough sessions`, no change and no
percentage are shown, and the subject needs 1 more session.

**A1-VRD-02 Window size.** Given RX Back Squat sessions on the 10th of each month in 2025 with values 100, 101, 102,
103, 104, 105, 106, 107, 108, 109 (January to October).
- With the first 6 (Jan to Jun: 100 to 105): `N` = 3, previous Jan to Mar best 102, recent Apr to Jun best 105.
- With the first 7 (to Jul: 106): `N` = 3, the oldest session (Jan) is not used, previous Feb to Apr best 103,
  recent May to Jul best 106.
- With all 10: `N` = 4, previous Mar to Jun best 105, recent Jul to Oct best 109, `change` +3.8%, `record` = the
  109 on 2025-10-10, 3.8% above the best before the recent window (105), `state` `up`.

**A1-VRD-03 Up by window, no record.** Given 9 sessions: 2024-01-10 230; 2024-04-10 190; 2024-07-10 195; 2024-10-10
200; 2025-01-10 192; 2025-04-10 205; 2025-07-10 208; 2025-10-10 210; 2026-01-10 207. Then `N` = 4, previous Apr 2024
to Jan 2025 best 200, recent Apr 2025 to Jan 2026 best 210, `change` +5.0%, `record` none (the 230 in 2024, before the
recent window, is higher than the recent best), `state` `up`.

**A1-VRD-04 The threshold compares the rounded percentage.** Given the sessions of A1-VRD-03 with the last recent
best changed to 209.8 (+4.9%) and then to 209.9 (+4.95%, which rounds to +5.0%). Then 209.8 reads `no clear change` and
209.9 reads `up`.

**A1-VRD-05 Up by record, under 5%.** Given the sessions 2024-03-05 170*; 2024-06-11 176; 2024-09-10 183*; 2024-12-03
186; 2025-01-10 195*; 2025-02-07 150; 2025-03-07 155; 2025-04-04 158; 2025-05-02 160; 2025-07-11 200*. Then `N` = 4,
previous Sep 2024 to Feb 2025 best 195, recent Mar to Jul 2025 best 200, `change` +2.6%, `record` = 2025-07-11 at
+2.6% over 195, `state` `up`, displayed "+5 lb (195 to 200 lb), +2.6%".

**A1-VRD-06 The record margin.** Given the sessions of A1-VRD-05 with the last session 198.9 and then 198.8. Then 198.9
(+2.0%) is a record and reads `up`; 198.8 (+1.9%) is not and reads `no clear change`. With 198 (+1.5%) it also reads
`no clear change`.

**A1-VRD-07 A build cycle is not a decline.** Given the first nine sessions of A1-VRD-05 (to 2025-05-02). Then `N` = 4,
previous Jun 2024 to Jan 2025 best 195, recent Feb to May 2025 best 160, `change` −17.9%, `record` none, no max effort
in the recent window, `state` `not tested since`, `lastTested` 2025-01-10 at 195, displayed "−35 lb (195 to 160 lb),
−17.9%". The state is never `down`.

**A1-VRD-08 A failed test is a decline.** Given the sessions of A1-VRD-07 with the last session 175 and marked `*`
(an explicit rep max). Then `change` −10.3%, a max effort sits in the recent window, `state` `down`.

**A1-VRD-09 One max effort anywhere in the recent window is enough.** Given the sessions of A1-VRD-07 with the
2025-02-07 session (150) marked `*`. Then `state` is `down` (a max effort is in the recent window although it was
not the best).

**A1-VRD-10 A light day does not matter.** Given 2025-01-10 200; 02-07 196; 03-07 198; 04-04 199; 05-02 200; 06-06 170;
07-04 199; 08-01 201. Then `N` = 4, previous best 200, recent best 201, `change` +0.5%, `state` `no clear change`.

**A1-VRD-11 Noise stays noise.** Given sessions alternating 188 and 212 on the 10th of each month from January 2025, at
6, 7 and 8 sessions. Then each reads previous best 212, recent best 212, `change` 0.0%, `record` none, `state`
`no clear change`.

**A1-VRD-12 A time benchmark.** Given Nancy Scaled: 2023-01-04 884; 2023-04-05 878; 2023-06-26 866; 2024-11-12 827;
2025-04-28 877; 2025-09-22 956; 2026-04-13 899 (seconds). Then `N` = 3, previous Apr 2023 to Nov 2024 best 827
(13:47), recent Apr 2025 to Apr 2026 best 877 (14:37), `change` −6.0%, `state` `down`, displayed "0:50 slower (13:47
to 14:37), 6.0% slower". A benchmark is never `not tested since`.

**A1-VRD-13 A faster benchmark.** Given a timed benchmark with sessions 2025-01-10 840; 02-07 830; 03-07 800; 04-04 760; 05-02
740; 06-06 720 (seconds). Then `change` +10.0%, `state` `up`, displayed "1:20 faster (13:20 to 12:00), 10.0% faster".
The record rule applies to benchmarks.

**A1-VRD-14 The PR flag is ignored.** Given the sessions of A1-VRD-05 with the PR flag set on every session. Then the
output is identical to A1-VRD-05.

**A1-VRD-16 The margin has no same-scheme exception.** Given six triples on the 10th of Jan to Jun 2025: 190, 192,
195, 196, 197 and 198 lb (estimated 205.1, 207.2, 210.5, 211.6, 212.6, 213.7). Then `N` = 3, previous best 210.5, recent
best 213.7, `change` +1.5%, `record` none, `state` `no clear change`, although every session used the same rep count.

**A1-VRD-17 A slow steady climb reads `up`.** Given 2025-01-10 to 2025-12-10, one session a month: 100, 101, ..., 111.
Then `N` = 4, previous May to Aug best 107, recent Sep to Dec best 111, `change` +3.7%, `record` = the 111 on
2025-12-10, 3.7% above the best before the recent window (107), `state` `up`, displayed "+4 lb (107 to 111 lb), +3.7%"
and "New best: 111 lb on Dec 10, 2025, 3.7% above the previous best of 107 lb."

**A1-VRD-18 A very slow climb stays unclear.** Given twelve monthly sessions 100 × 1.0025^m (100.00, 100.25, 100.50,
100.75, 101.00, 101.26, 101.51, 101.76, 102.02, 102.27, 102.53, 102.78). Then previous best 101.76, recent best 102.78,
`change` +1.0%, `record` none, `state` `no clear change`.

**A1-VRD-19 The record is the recent best.** Given 2025-01-10 100; 02-07 102; 03-07 104; 04-04 108; 05-02 110; 06-06
112. Then `N` = 3, `change` +7.7%, `record` = the 112 on 2025-06-06, 7.7% above the best before the recent window (104),
`state` `up`, and the note reads "New best: 112 lb on Jun 6, 2025, 7.7% above the previous best of 104 lb." (not the
108 or the 110).

**A1-VRD-20 An older peak blocks the record.** Given the sessions of A1-DSP-01 (the 205 in 2023 is the best before the
recent window). Then `record` none although the window change is +8.7%; `state` `up` through the window alone.
Without the 2023 session the same eight sessions give `record` = the 200 on 2026-03-30, 8.7% above 184.

**A1-VRD-15 A verdict reads only SugarWOD rows.** Given the sessions of A1-VRD-05 with and without InBody scans,
bodyweight entries, periods and tags. Then the output is identical.

## Display (DSP)

**A1-DSP-01 Window and change.** Given Front Squat RX: 2023-07-07 205; 2024-03-11 166; 2024-03-18 161; 2024-04-08
184; 2025-03-31 178; 2026-02-03 189; 2026-03-30 200; 2026-04-07 178; 2026-08-07 194. Then `N` = 4, previous Mar 2024
to Mar 2025 best 184, recent Feb to Aug 2026 best 200, `record` none (the 205 in 2023 is higher), `state` `up`,
displayed "Last 4: Feb to Aug 2026 · Previous 4: Mar 2024 to Mar 2025" and "+16 lb (184 to 200 lb), +8.7%".

**A1-DSP-02 Window months.** A window inside one month shows that month ("Aug 2026"); inside one year shows
"Mar to Aug 2026"; across years shows "Mar 2024 to Mar 2025".

**A1-DSP-03 Time words and format.** A benchmark that is 6.0% slower shows "0:50 slower (13:47 to 14:37), 6.0%
slower"; 10.0% faster shows "1:20 faster (13:20 to 12:00), 10.0% faster". Times under an hour are `m:ss`.

**A1-DSP-04 Rounds + Reps with a known reps per round.** Given Cindy RX, six sessions, display scores 16, 15+10, 16+5,
16+15, 17+2, 17+20 (480, 460, 485, 495, 512, 530 reps at 30 per round). Then previous best 485 (16+5), recent best 530
(17+20), `change` +9.3%, `state` `up` (a record: 17+20, 9.3% above the 485 before the recent window), displayed "+45 reps (16+5 to 17+20), +9.3%".

**A1-DSP-05 Rounds + Reps with no known reps per round** shows both scores ("16+15 to 18+2") and no difference.

**A1-DSP-06 Rounds + Reps are read from the display.** A raw value `5.01` with display `5+10` is 5 rounds and 10 reps;
`12.0019` with display `12+19` is 12 and 19; `16.015` with display `16+15` is 16 and 15; display `16` is 16 and 0.

**A1-DSP-07 No change in the best.** Given bests of 211.6 and 212.4 (both 212 lb to the pound). Then the line reads
"no change in the best (212 and 212 lb)" and no percentage. The `state` still follows the unrounded rule (here `no
clear change`).

**A1-DSP-08 Long gap.** A recent window from 2024-01-18 to 2026-03-10 (782 days) shows "Recent sessions span 26 months
(Jan 2024 to Mar 2026)." One of 21 months shows no note. The `state` is unchanged in both.

## Facts line (FCT)

**A1-FCT-01 2 to 5 sessions.** Given Hang Power Clean RX with 5 sessions, the last two 2026-03-10 175 and 2026-08-19
185. Then the line reads "Hang Power Clean (RX): 5 sessions. Latest 185 lb est. (Aug 2026), previous 175 lb est. (Mar
2026), +10 lb. Needs 1 more session for a verdict." It shows no verdict word, no percentage and no pill, and is not
counted in the headline.

**A1-FCT-02 6 or more sessions** show the verdict and no facts line.

**A1-FCT-03 A single session** reads "Back Pause Squat (RX): 1 session (Sep 2023). Needs 5 more sessions for a
verdict." with no comparison.

**A1-FCT-04 A time benchmark.** Given Fran Scaled 2023-01-16 456 s, 2023-04-11 392 s, 2025-05-19 457 s. Then "Fran
(Scaled): 3 sessions. Latest 7:37 (May 2025), previous 6:32 (Apr 2023), 1:05 slower. Needs 3 more sessions for a
verdict."

**A1-FCT-05 Rounds + Reps.** Given Cindy RX 16 and 16+15 (two sessions). Then with the lookup the line gives "+15 reps";
with no lookup it shows "Latest 16+15 (Jan 2025), previous 16 (May 2023)" and no difference.

**A1-FCT-06 A lower latest result** shows the signed difference ("−10 lb"); equal results show "no change".

**A1-FCT-07 A stale subject** (3 sessions, latest 14 months before the reference date) still shows the line, with "last
logged" and the month. It is counted under "under 6 sessions" in the paragraph.

## Scaled and RX (SCL)

**A1-SCL-01 No cross-status verdict.** Given Fran Scaled 2023-01-16 7:36, 2023-04-11 6:32, 2025-05-19 7:37 and Fran RX
2025-12-08 9:13. Then Fran Scaled shows the facts line of A1-FCT-04 and "Also logged as RX: 1 session (Dec 2025),
9:13"; no `down` appears anywhere; no percentage compares Scaled with RX.

**A1-SCL-02 A move up to RX.** Given the same. Then Fran RX reads `up` with "Moved up to RX in Dec 2025, after 3
Scaled sessions." and no percentage, although 9:13 is slower than every Scaled time.

**A1-SCL-03 The vote lasts 12 months.** Given the Fran move on 2025-12-08. Then as of 2026-09-11 (277 days) it counts
in the headline as an up vote; as of 2027-01-01 (389 days) the line remains and casts no vote.

**A1-SCL-04 Only the move counts.** Given Grace Scaled 2022-11-21 3:45, 2023-10-10 3:45 and Grace RX 2026-03-31 4:51,
2026-07-07 4:32. Then Grace RX reads `up` ("Moved up to RX in Mar 2026, after 2 Scaled sessions.") and shows "Also
logged as Scaled: 2 sessions (Nov 2022 to Oct 2023), latest 3:45". The second RX session adds no vote. When Grace RX
reaches 6 sessions its normal verdict replaces the move-up.

**A1-SCL-05 An older move shows the fact only.** Given Helen Scaled 2023-09-07 12:31 and Helen RX 2024-10-10 10:40,
2024-12-03 9:47, 2026-07-10 11:35. Then Helen RX shows "Moved up to RX in Oct 2024, after 1 Scaled session." and no
vote (701 days), plus the facts line for its 3 RX sessions.

**A1-SCL-06 Moving down is neutral.** Given Cindy RX 2023-05-02 16, 2025-01-11 16+15 and Cindy Scaled 2026-04-17
12+19. Then Cindy Scaled shows "Also logged as RX: 2 sessions (May 2023 to Jan 2025), latest 16+15" and Cindy RX shows
"Also logged as Scaled: 1 session (Apr 2026), 12+19". No `down` and no vote.

**A1-SCL-07 The same day is no move.** A Scaled and an RX Fran session on the same day make no move.

**A1-SCL-08 Lifts follow the same rule.** Given Back Squat RX 2023-07-24 213, Scaled 2023-07-31 145, RX 2023-08-07 225.
Then the 2023-08-07 session is a move up dated Aug 2023 and, as of 2026-09-11, casts no vote; Back Squat RX keeps its
normal verdict.

**A1-SCL-09 The cross-reference changes no count.** Adding or removing a cross-reference line changes no headline
count, label or paragraph clause.

## Recency (REC)

**A1-REC-01 The same inputs give the same result.** Given a history and a reference date. Then two runs give identical
output; nothing reads the clock.

**A1-REC-02 The 365-day line.** Given a subject with 6 sessions, the latest on 2025-09-11. Then as of 2026-09-11 (365
days) it is recent; with the latest on 2025-09-10 (366 days) it is `not recent`.

**A1-REC-03 A not-recent subject** shows its verdict marked "Not recent: last logged Aug 2025" and is excluded from the
counts, the label, the front door and the "counted" figure.

**A1-REC-04 The sample drifts with the date** (derived, to be confirmed by running). As of 2027-04-30 Power Snatch
(last 2026-03-10), Nancy (2026-04-13) and Deadlift (2026-04-29) are `not recent`, the Fran and Grace move-ups have
passed 12 months, and the headline reads 4 up of 9 (5 no clear change).

**A1-REC-05 Nothing recent.** With no counted subject because every subject is not recent, the headline reads "No lift
or benchmark was logged in the last 12 months." and shows no label.

**A1-REC-06 Future dates are ignored.** A session dated after the reference date is not used.

## Headline (HDL)

**A1-HDL-01 The label.** Counts (up / no clear change / down → label): 3 / 3 / 1 → `Improving`; 2 / 5 / 0 → `Holding
steady` (net +0.29 but 29% up); 1 / 2 / 0 → `Improving` (exactly a third up); 1 / 3 / 0 → `Holding steady`; 5 / 0 / 1 →
`Improving`; 0 / 5 / 2 → `Holding steady` (29% down); 1 / 1 / 4 → `Declining`; 1 / 0 / 3 → `Declining`; 3 / 3 / 3 →
`Holding steady`; 6 / 5 / 1 → `Improving`. Two counted subjects give no label.

**A1-HDL-02 The counts sentence, Improving.** 8 up, 5 no clear change and 1 down of 14 reads "Improving in 8 of 14 lifts
and benchmarks (5 no clear change, 1 down)." A zero part is dropped: 5 up and 1 down of 6 reads "Improving in 5 of 6
lifts and benchmarks (1 down)."; 4 up of 4 reads "Improving in 4 of 4 lifts and benchmarks."

**A1-HDL-03 The counts sentence, other labels (pending).** Proposed wording: `Declining` with 1 up, 4 no clear
change and 4 down of 9 reads "Declining in 4 of 9 lifts and benchmarks (4 no clear change, 1 up)." and `Holding
steady` with 2 up and 5 no clear change of 7 reads "Holding steady across 7 lifts and benchmarks (2 up, 5 no clear
change)."

**A1-HDL-04 The paragraph, full sample** (as of 2026-09-11). Then "Includes 2 that moved up to RX. Left out: 31 with
under 6 sessions. 2 compare sessions over 24 months apart. Log through Sep 11, 2026."

**A1-HDL-05 Clauses appear only above zero, in order.** With 4 counted subjects all up and nothing else, the
paragraph is "Log through Sep 11, 2026."

**A1-HDL-06 Singular.** 1 move-up, 1 with under 6 sessions, 1 not logged in 12 months, 1 not tested recently and 1 long
gap read "Includes 1 that moved up to RX. Left out: 1 with under 6 sessions, 1 not logged in 12 months, 1 not tested
recently. 1 compare session over 24 months apart. Log through Sep 11, 2026."

**A1-HDL-07 Left-out reasons are exclusive.** A subject with 4 sessions whose latest is 2 years old appears only under
"under 6 sessions". A benchmark is never "not tested recently".

**A1-HDL-08 Not tested since is left out of the net.** A lift in `not tested since` is not counted in the sentence or
the label and appears under "not tested recently".

**A1-HDL-09 Move-ups are counted.** A move-up within 12 months counts as one up vote and in "counted".

**A1-HDL-10 No headline, none counted.** Back Squat (5 sessions, latest last month), Clean (4) and Shoulder Press (2)
read "No headline yet: needs 3 lifts or benchmarks with a verdict, has 0. Closest: Back Squat, 1 more session; Clean, 2
more." then "Left out: 3 with under 6 sessions. Log through Sep 11, 2026."

**A1-HDL-11 No headline, two counted** reads "...has 2." and names the closest.

**A1-HDL-12 Closest skips not-recent subjects.** Push Jerk (5 sessions, latest Aug 2025, 391 days) is never named; Hang
Power Clean (5 sessions, latest Aug 2026) is. Ties go to the more recently logged. With no candidate the closest part
is omitted.

**A1-HDL-13 Coverage on the sample.** With 45 subjects, 12 with a verdict and 2 move-ups, "Left out" says 31; facts
lines appear for 16 of them and the other 15 have a single session.

**A1-HDL-14 How this was counted** is collapsed by default. Open, it lists the 12 verdicts and 2 move-ups, the 31 left
out with names, the 2 long-gap subjects (Power Snatch, Power Clean) and "272 of 526 weight entries weren't used: 210
no readable rep scheme, 15 outside 1 to 8 reps, 47 no lift named."

**A1-HDL-15 Log through** shows the date of the latest session in the log, always.

## Family breakdown (BRK)

**A1-BRK-01 Summary.** Counted subjects Clean, Power Clean and Clean & Jerk; Front Squat and Back Squat; Snatch and
Power Snatch; Shoulder Press and Push Press; Deadlift; Bench Press; Nancy give "Votes per family: Clean 3 · Press 2 ·
Snatch 2 · Squat 2. The other families have one each."

**A1-BRK-02 Opened.** It lists seven rows, each "x of y up" with its members (Clean 2 of 3, Squat 1 of 2, Snatch 1 of 2,
Press 1 of 2, Deadlift 1 of 1, Bench Press 0 of 1, Benchmarks 0 of 1) and says it is information only. Opening or
closing it changes no count, label or order.

**A1-BRK-03 Not shown** when every family has one counted subject.

## Evidence chart (CHT)

**A1-CHT-01** The chart opens from a subject row with a verdict. The Workouts lift chart gains no estimated-1RM option.

**A1-CHT-02** One dot per day, equal to that day's best estimated 1RM.

**A1-CHT-03** Previous-window dots are dark, recent-window dots use the accent, all others are faint. There are no
shaded areas, no legend and no controls.

**A1-CHT-04** The two window bests are labelled with their values. When the recent best is a record it is a larger
accent dot labelled "365 · new best +4.0%", the only new-best marker.

**A1-CHT-05** Quarterly bests of 100, 102, 104 and 106 draw a rising dashed line labelled "Trend" ending at the last
quarter. Three quarters draw no line.

**A1-CHT-06** The trend line has no number and no up or down wording, and uses the subject's whole history whatever
the dashboard's date range.

**A1-CHT-07** Rings appear only for `down` and `not tested since`, on every max-effort session. For `up` and `no
clear change` there are none.

**A1-CHT-08** The muted line reads "Highlighted dots are the sessions the verdict compared. The dashed line is the
long-run trend." and adds " Rings mark max efforts." only when rings are shown.

**A1-CHT-09** For `not tested since` the text above the chart reads "Last tested Jan 10, 2025 at 195 lb. Recent
sessions are lighter work."

**A1-CHT-10** Power Clean (trend line flat to down, verdict `up`) shows both and no reconciliation.

**A1-CHT-11** RX and Scaled of one name have separate charts.

**A1-CHT-12** At 360 px wide the chart's text is at least 11 px and nothing overflows horizontally.

## Manual checks (MAN)

**A1-MAN-01 Real export.** Run the rules on the real export and confirm the stability figures in the spec are in the
same range before any threshold is trusted. Count the Scaled Load rows and the Scaled-to-RX moves.

**A1-MAN-02 Units.** Confirm on the real export that a lift the athlete logs in kilograms appears in pounds in the file.

## Open points the cases exposed

These are not covered by a decision yet. The cases above record the current behaviour or are marked pending.

1. **Sentence wording for `Holding steady` and `Declining`** is undefined (A1-HDL-03 proposes wording).
2. **Zero-change wording** (A1-DSP-07) assumes "the same pound" is the test; confirm.
3. **Times of an hour or more** are shown `h:mm:ss` (A1-DSP-03); not previously stated.
4. **The shortfall string.** The data holds "has 5, needs 6"; each screen shows its own wording ("Needs 1 more session
   for a verdict", "1 more session"). Confirm the data/display split.

Resolved while writing the cases: the record rule applies to benchmarks (A1-VRD-13), and a record now means the recent
best is 2% above the best before the recent window, which fixes the new-best note and lets a slow steady climb read
`up` (A1-VRD-17 to A1-VRD-20).
