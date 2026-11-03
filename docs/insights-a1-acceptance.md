# A1 acceptance cases

**Status: draft for review, nothing built.** These are the acceptance cases for the A1 specification
([`insights-a1-spec.md`](insights-a1-spec.md)), written so each can become a test: exact inputs, exact outputs.
They replace the scattered case lists that used to sit in the spec. Terms follow [`insights-glossary.md`](insights-glossary.md). Every expected value for the verdict
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
  counted`; `Declining` is the mirror; otherwise `Steady`. Fewer than 3 counted gives no label.

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
percentage are shown, and the shortfall data is `{ has: 5, needs: 6 }`. The subject row says "Needs 1 more session for
a verdict." and, with 4 sessions, "Needs 2 more sessions for a verdict."; "(has 5, needs 6)" is never shown.

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
slower"; 10.0% faster shows "1:20 faster (13:20 to 12:00), 10.0% faster". Times under an hour are `m:ss`; from an hour
up they are `h:mm:ss`: previous 3508 s and recent 3735 s show "3:47 slower (58:28 to 1:02:15), 6.5% slower", and previous
2400 s with recent 6135 s show "1:02:15 slower (40:00 to 1:42:15), 155.6% slower".

**A1-DSP-04 Rounds + Reps with a known reps per round.** Given Cindy RX, six sessions, display scores 16, 15+10, 16+5,
16+15, 17+2, 17+20 (480, 460, 485, 495, 512, 530 reps at 30 per round). Then previous best 485 (16+5), recent best 530
(17+20), `change` +9.3%, `state` `up` (a record: 17+20, 9.3% above the 485 before the recent window), displayed "+45 reps (16+5 to 17+20), +9.3%".

**A1-DSP-05 Rounds + Reps with no known reps per round** shows both scores ("16+15 to 18+2") and no difference.

**A1-DSP-06 Rounds + Reps are read from the display.** A raw value `5.01` with display `5+10` is 5 rounds and 10 reps;
`12.0019` with display `12+19` is 12 and 19; `16.015` with display `16+15` is 16 and 15; display `16` is 16 and 0.

**A1-DSP-07 No change in the best.** The line reads "no change in the best" and no percentage when the two bests display as
the same value. Lift: bests of 211.6 and 212.4 (both 212 lb) read "no change in the best (212 and 212 lb)". Time: bests of
827 s and 827 s read "(13:47 and 13:47)". Rounds + Reps: totals of 485 and 485 read "(16+5 and 16+5)". The `state` still
follows the unrounded rule (here `no clear change`).

**A1-DSP-08 Long gap.** A recent window from 2024-01-18 to 2026-03-10 (782 days) shows "Recent sessions span 26 months
(Jan 2024 to Mar 2026)." One of 21 months shows no note. The `state` is unchanged in both.

## Facts line (FCT)

**A1-FCT-01 2 to 5 sessions.** Given Hang Power Clean RX with 5 sessions, the last two 2026-03-10 175 and 2026-08-19
185. Then the line reads "Hang Power Clean (RX): 5 sessions. Latest 185 lb est. (Aug 2026), previous 175 lb est. (Mar
2026), +10 lb. Needs 1 more session for a verdict." It shows no verdict word, no percentage and no pill, and is not
counted in the headline.

**A1-FCT-02 6 or more sessions** show the verdict and no facts line.

**A1-FCT-08 The shortfall wording.** A subject with 5 sessions reads "Needs 1 more session for a verdict."; with 4, "Needs 2
more sessions for a verdict."; in the no-headline part "Closest: Back Squat, 1 more session; Clean, 2 more." (only the first
item spells out "session"). The data holds `{ has, needs }`; no screen shows "(has 5, needs 6)".

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
steady` (net +0.29 but 29% up); 1 / 2 / 0 → `Improving` (exactly a third up); 1 / 3 / 0 → `Steady`; 5 / 0 / 1 →
`Improving`; 0 / 5 / 2 → `Steady` (29% down); 1 / 1 / 4 → `Declining`; 1 / 0 / 3 → `Declining`; 3 / 3 / 3 →
`Steady`; 6 / 5 / 1 → `Improving`. Two counted subjects give no label.

**A1-HDL-02 The counts sentence, Improving.** 8 up, 5 no clear change and 1 down of 14 reads "Improving in 8 of 14 lifts
and benchmarks (5 no clear change, 1 down)." A zero part is dropped: 5 up and 1 down of 6 reads "Improving in 5 of 6
lifts and benchmarks (1 down)."; 4 up of 4 reads "Improving in 4 of 4 lifts and benchmarks."

**A1-HDL-03 The counts sentence, other labels.** `Declining` with 1 up, 4 no clear change and 4 down of 9 reads "Declining in 4 of
9 lifts and benchmarks (4 no clear change, 1 up)." `Steady` with 2 up and 5 no clear change of 7 reads "Holding
steady across 7 lifts and benchmarks (2 up, 5 no clear change)."; with 3 up, 6 no clear change and 2 down of 11 it reads
"Steady across 11 lifts and benchmarks (3 up, 6 no clear change, 2 down)." A zero part is dropped.

**A1-HDL-04 The paragraph, full sample** (as of 2026-09-11). Then "Includes 2 that moved up to RX. Left out: 31 with
under 6 sessions. 2 compare sessions over 24 months apart. As of Sep 11, 2026."

**A1-HDL-05 Clauses appear only above zero, in order.** With 4 counted subjects all up and nothing else, the
paragraph is "As of Sep 11, 2026."

**A1-HDL-06 Singular.** 1 move-up, 1 with under 6 sessions, 1 not logged in 12 months, 1 not tested recently and 1 long
gap read "Includes 1 that moved up to RX. Left out: 1 with under 6 sessions, 1 not logged in 12 months, 1 not tested
recently. 1 compare session over 24 months apart. As of Sep 11, 2026."

**A1-HDL-07 Left-out reasons are exclusive.** A subject with 4 sessions whose latest is 2 years old appears only under
"under 6 sessions". A benchmark is never "not tested recently".

**A1-HDL-08 Not tested since is left out of the net.** A lift in `not tested since` is not counted in the sentence or
the label and appears under "not tested recently".

**A1-HDL-09 Move-ups are counted.** A move-up within 12 months counts as one up vote and in "counted".

**A1-HDL-10 No headline, none counted.** Back Squat (5 sessions, latest last month), Clean (4) and Shoulder Press (2)
read "No headline yet: needs 3 lifts or benchmarks with a verdict, has 0. Closest: Back Squat, 1 more session; Clean, 2
more." then "Left out: 3 with under 6 sessions. As of Sep 11, 2026."

**A1-HDL-11 No headline, two counted** reads "...has 2." and names the closest.

**A1-HDL-12 Closest skips not-recent subjects.** Push Jerk (5 sessions, latest Aug 2025, 391 days) is never named; Hang
Power Clean (5 sessions, latest Aug 2026) is. Ties go to the more recently logged. With no candidate the closest part
is omitted.

**A1-HDL-13 Coverage on the sample.** With 45 subjects, 12 with a verdict and 2 move-ups, "Left out" says 31; facts
lines appear for 16 of them and the other 15 have a single session.

**A1-HDL-14 How this was counted** is collapsed by default. Open, it lists the 12 verdicts and 2 move-ups, the 31 left
out with names, the 2 long-gap subjects (Power Snatch, Power Clean) and "272 of 526 weight entries weren't used: 210
no readable rep scheme, 15 outside 1 to 8 reps, 47 no lift named."

**A1-HDL-15 As of** shows the date of the latest session in the log, always, as "As of Sep 11, 2026." It is the last clause of the coverage paragraph and is the only date shown near the top.

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

**A1-CHT-10** Power Clean (trend line level or sloping down, verdict `up`) shows both and no reconciliation.

**A1-CHT-11** RX and Scaled of one name have separate charts.

**A1-CHT-12** At 360 px wide the chart's text is at least 11 px and nothing overflows horizontally.

**A1-CHT-13 Dots only for a facts-line subject.** Given Hang Power Clean RX with 2022-12-06 139.9; 2023-01-02 120.5; 2023-01-09
151.9; 2026-01-06 205.1; 2026-08-19 214.8. Then the row opens to a chart of 5 dots in one style, with no highlighted dots, no
shaded areas, no value labels, no new-best marker and no rings. There is no trend line although the sessions span 4 calendar
quarters.

**A1-CHT-14 The dots-only text.** The muted line reads "Each dot is the best result of a day." and nothing else; each dot's tooltip
gives the date and the estimated 1RM, and "max effort" where it applies.

**A1-CHT-15 One session has no chart.** A subject with a single session opens to no chart (assumption, to confirm).

**A1-CHT-16 A sixth session replaces the dots-only chart.** When the subject reaches 6 sessions it opens to the evidence chart of
A1-CHT-02 to A1-CHT-09.

## Last PR (PRL)

**A1-PRL-01 A lift.** Given Deadlift RX whose best estimated 1RM is 365 lb on 2026-03-24 (20 sessions). Then the line reads
"Last PR: 365 lb est. on Mar 24, 2026".

**A1-PRL-02 A time benchmark.** Given Nancy Scaled 884, 878, 866, 827, 877, 956, 899 seconds (2023-01-04 to 2026-04-13), the
best being 827 on 2024-11-12. Then the line reads "Last PR: 13:47 on Nov 12, 2024" (lower is better).

**A1-PRL-03 A tie is not a PR.** Given RX sessions 2025-01-10 190, 2025-02-07 195 and 2025-03-07 195. Then the line reads
"Last PR: 195 lb est. on Feb 7, 2025".

**A1-PRL-04 A single session shows no line.**

**A1-PRL-05 An old PR is still shown and does not vote.** Given the sessions of A1-DSP-01 (best 205 on 2023-07-07). Then the
line reads "Last PR: 205 lb est. on Jul 7, 2023", while the verdict is `up` through the window alone, and removing the line
changes no verdict, count, label or paragraph clause.

**A1-PRL-06 Rounds + Reps.** Given Cindy RX with the totals of A1-DSP-04 (best 530 reps, 17+20, on 2024-08-01). Then the line
reads "Last PR: 17+20 on Aug 1, 2024".

**A1-PRL-07 RX and Scaled are separate.** Fran Scaled and Fran RX each show their own last PR; neither compares with the other.

**A1-PRL-08 A facts-line subject** (2 to 5 sessions) shows the Last PR line as well as its facts line, and a subject that is
not recent still shows it.

## Subject-list groups (GRP)

Counts are on the bundled sample as of 2026-09-09 (derived, to be confirmed by running). Layout is in
[`insights-front-door.md`](insights-front-door.md).

**A1-GRP-01 Separate groups, in order.** The groups appear as Up, Down, Not tested since, No clear change, Fewer than 6
sessions, Not recent. On the sample: Up 8, Down 1, No clear change 5, Fewer than 6 sessions 13, Not recent 20, and no Not
tested since group.

**A1-GRP-02 Up is sorted by size.** On the sample the order is Power Snatch RX +16.8%, Power Clean RX +13.5%, Push Press RX
+9.5%, Front Squat RX +8.8%, Clean RX +7.5%, Deadlift RX +4.4%, then Fran and Grace.

**A1-GRP-03 Move-ups follow the sized rows.** Fran (first RX session Dec 2025) and Grace (Mar 2026) have no percentage and
follow Deadlift, most recent move-up first (Grace, then Fran).

**A1-GRP-04 Down is its own group.** Nancy Scaled (6.0% slower, 13:47 to 14:37) is listed alone under "Down 1" and never
appears in Up. Within Down, the largest fall comes first.

**A1-GRP-05 An empty group is not shown.** With no `down` and no `not tested since` subject, neither heading appears.

**A1-GRP-06 Collapsed by default:** No clear change, Fewer than 6 sessions and Not recent show their name and
count only; Up, Down and Not tested since are open. A group's count equals its rows, and the counts follow the "Logged in"
filter (A1-FLT-06).

**A1-GRP-07 Nothing moved.** With no `up` and no `down` subject, the list opens with "No lift or benchmark has moved
clearly." above the collapsed groups, and no Up or Down heading appears.

## Page order and states (PGE)

Layout is in [`insights-front-door.md`](insights-front-door.md). Sample values are as of 2026-09-09.

**A1-PGE-01 Order.** The page reads, top to bottom: title and scope line, headline, body-context line (only with body
data), "Logged in" filter with its line, subject list, small links.

**A1-PGE-02 Scope line.** It reads "Uses your full history." under every filter option and every state.

**A1-PGE-03 No headline yet.** With fewer than 3 counted subjects the headline reads as in A1-HDL-10, the coverage
paragraph and the list still show, and no label shows.

**A1-PGE-04 Nothing recent.** With every subject's latest session over 365 days old, the headline reads "No lift or
benchmark was logged in the last 12 months." with no label, and every subject is listed under Not recent.

**A1-PGE-05 No data at all.** A log with no lift or benchmark sessions reads "No lift or benchmark has been logged yet."
with no headline, no filter and no list, and the small links still show.

**A1-PGE-06 No body data.** With no scans and no weigh-ins the body-context line is absent, the headline and list are
unchanged, and the small links include "Add body composition". With body data that link is absent.

**A1-PGE-07 One date near the top.** The only date shown above the list is the "As of" clause at the end of the coverage
paragraph.

## Front-door filter (FLT)

The filter is described in [`insights-front-door.md`](insights-front-door.md). Counts below are on the bundled sample
as of the end of its log (derived, to be confirmed by running); demo mode extends the sample through today, so they drift.

**A1-FLT-01 All is the default** and lists every subject (45 on the sample). Nothing is filtered and no "Showing" line
appears.

**A1-FLT-02 The sample counts.** As of 2026-09-09, "Last month" lists 5 subjects, "Last 3 months" 15, "Last 6 months" 22
and "Last year" 25.

**A1-FLT-03 The line.** When a period is chosen, the muted line under the control reads "Showing 5 of 45 subjects."
With All it is absent. The 45 is every subject, including not-recent and facts-line subjects.

**A1-FLT-04 Nothing else changes.** Under every option the headline label, the counts sentence, the coverage paragraph
and "How this was counted" are identical, and every listed row shows the same state, change and chart it shows under All.

**A1-FLT-05 The boundary.** With reference date 2026-09-09, a subject whose latest session is on 2026-08-09 is listed
under "Last month"; one whose latest session is on 2026-08-08 is not. A month that is shorter than the reference day
clamps as the date-range control does (reference 2026-03-31, "Last month" starts 2026-02-28).

**A1-FLT-06 Every group is filtered**, including the collapsed ones. A facts-line subject logged 10 days ago is listed
under "Last month" with its facts line; its group count reflects the filter.

**A1-FLT-07 A not-recent subject** (latest session over 365 days ago) is never listed under any preset.

**A1-FLT-08 An empty period.** When no subject qualifies the list reads "No lift or benchmark was logged in this
period.", the "Showing 0 of 45 subjects." line stays, and the headline is unchanged.

**A1-FLT-09 Not saved.** Leaving Insights and returning, or reloading, shows All.

**A1-FLT-10 Local to the list.** Choosing a period changes nothing on Overview, Workouts, the domain, modality, Movements
or Body Comp views, or on Periods, and the scope line still reads "Uses your full history." The date-range control on
those views keeps its own selection, and this filter does not follow it.

**A1-FLT-11 Custom range** (proposed details). Choosing Custom with 2026-03-01 to 2026-04-30 lists every subject with at
least one session in that span, both dates inclusive, and the line reads "Showing N of 45 subjects."

**A1-FLT-12 Custom bounds** (proposed details). A start after the end is not applied and an inline message says so; the
list keeps its previous contents. The end date defaults to today.

**A1-FLT-13 Custom does not touch verdicts.** A subject listed under a custom range that holds 1 session shows the same
verdict, change and chart it shows under All.

## Manual checks (MAN)

**A1-MAN-01 Real export.** Run the rules on the real export and confirm the stability figures in the spec are in the
same range before any threshold is trusted. Count the Scaled Load rows and the Scaled-to-RX moves.

**A1-MAN-02 Units.** Confirm on the real export that a lift the athlete logs in kilograms appears in pounds in the file.

## Open points

None. The four display points the cases exposed are decided: the sentence for `Steady` and `Declining`
(A1-HDL-03), the zero-change test (A1-DSP-07), times of an hour or more (A1-DSP-03) and the shortfall wording
(A1-VRD-01, A1-FCT-08). The record rule applies to benchmarks (A1-VRD-13), and a record is the recent best 2% above the
best before the recent window (A1-VRD-17 to A1-VRD-20).
