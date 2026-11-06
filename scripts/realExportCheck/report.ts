/** Formats the real-export check. Counts and percentages only, unless `names` is true: lift and benchmark names are training content. */
import { bodyCoverage, entryCheck, mergeCheck, sessionCountBands, shuffleBaseline, stability, type EntrySpec, type Scan } from "./analysis.ts";
import { classify, type Subject, type Unused } from "./a1.ts";

export interface CheckInput {
  subjects: Subject[];
  unused: Unused;
  asOf: string;
  scans?: Scan[];
  entries?: EntrySpec[];
  names?: boolean;
}

const pct = (a: number, b: number): string => (b === 0 ? "n/a" : `${((a / b) * 100).toFixed(0)}%`);

export function buildReport(input: CheckInput): string {
  const { subjects, unused, asOf } = input;
  const { rows, headline } = classify(subjects, asOf);
  const out: string[] = [];
  const h = (t: string): void => { out.push("", t, "-".repeat(t.length)); };
  out.push(`Swift real-export check (as of ${asOf}). Local only: nothing here was sent anywhere.`);
  out.push(input.names ? "Names are SHOWN. Do not paste this report anywhere public." : "Names are hidden. Counts and percentages only.");

  h("1. What was read (A1-MAN-01)");
  const lifts = subjects.filter((s) => s.kind === "lift"), bench = subjects.filter((s) => s.kind === "benchmark");
  const bands = sessionCountBands(subjects);
  out.push(`Subjects: ${subjects.length} (${lifts.length} lifts, ${bench.length} benchmarks). RX ${subjects.filter((s) => s.status === "RX").length}, Scaled ${subjects.filter((s) => s.status === "SCALED").length}.`);
  out.push(`Sessions per subject: 1 session ${bands.one}; 2 to 5 ${bands.twoToFive}; 6 or more ${bands.sixPlus}.`);
  out.push(`Load rows ${unused.loadRows}: used ${unused.used}; unused ${unused.loadRows - unused.used} (no readable rep scheme ${unused.noScheme}; outside 1 to 8 reps ${unused.outsideRange}; no numeric result ${unused.noValue}; no lift named ${unused.noLiftNamed}; neither RX nor Scaled ${unused.neitherStatus}).`);
  const scaledLoad = lifts.filter((s) => s.status === "SCALED").reduce((n, s) => n + s.entries.length, 0);
  out.push(`Scaled lift entries used: ${scaledLoad}.`);

  h("2. Verdicts today");
  const g = (k: string): number => rows.filter((r) => r.group === k).length;
  out.push(`Up ${g("up")} (including ${headline.moveUps} that moved up to RX), Down ${g("down")}, Not tested since ${g("not-tested-since")}, No clear change ${g("no-clear-change")}, Fewer than 6 sessions ${g("few")}, Not recent ${g("not-recent")}.`);
  out.push(`Headline: ${headline.label ?? "none"}. ${headline.sentence}`);
  out.push(`Left out: ${headline.leftOut.under6} with under 6 sessions, ${headline.leftOut.notRecent} not logged in 12 months, ${headline.leftOut.notTested} not tested since.`);
  const maxEff = subjects.filter((s) => s.kind === "lift").reduce((n, s) => n + s.sessions.filter((x) => x.maxEffort).length, 0);
  const liftSessions = subjects.filter((s) => s.kind === "lift").reduce((n, s) => n + s.sessions.length, 0);
  out.push(`Lift sessions that read as max efforts: ${maxEff} of ${liftSessions} (${pct(maxEff, liftSessions)}).`);
  if (input.names) {
    out.push("", "Subject | group | change | sessions | last logged");
    for (const r of rows) out.push(`${r.subject.name} (${r.subject.status === "RX" ? "RX" : "Scaled"}) | ${r.group} | ${r.verdict ? `${r.verdict.change >= 0 ? "+" : ""}${r.verdict.change}%` : "n/a"} | ${r.subject.sessions.length} | ${r.latest}`);
  }

  h("3. Stability (compare with the spec: the old rule flipped about half the time)");
  const st = stability(subjects);
  out.push(`Adding one more session changed the verdict in ${st.flips} of ${st.pairs} cases (${pct(st.flips, st.pairs)}) across ${st.subjects} subjects with 7 or more sessions.`);
  const sb = shuffleBaseline(subjects);
  out.push(`Same values in random order (${sb.subjects} eligible subjects, 200 shuffles each): Up ${pct(sb.shuffled.up, sb.shuffled.total)}, Down ${pct(sb.shuffled.down, sb.shuffled.total)}, Not tested since ${pct(sb.shuffled.nts, sb.shuffled.total)}.`);
  out.push(`The real history: Up ${pct(sb.actual.up, sb.actual.total)}, Down ${pct(sb.actual.down, sb.actual.total)}, Not tested since ${pct(sb.actual.nts, sb.actual.total)}.`);
  out.push("If the real Up share is not clearly above the shuffled one, Up is not separating real change from noise for this athlete.");

  h("4. Units and estimates (A1-MAN-02)");
  const top = lifts.map((s) => ({ s, best: Math.max(...s.sessions.map((x) => x.value)) })).sort((a, b) => b.best - a.best).slice(0, 6);
  out.push(`Largest estimated 1RM per lift, in the pounds the file holds: ${top.map((t) => `${input.names ? `${t.s.name}: ` : ""}${Math.round(t.best)} lb`).join("; ")}.`);
  out.push("Check these against what you lifted. If a lift you log in kilograms looks about 2.2 times too small, the export is not in pounds.");

  h("5. Merging RX and Scaled for lifts");
  const m = mergeCheck(subjects);
  out.push(`Lifts logged both ways: ${m.liftsWithBoth}. If merged: ${m.becomeEligible} more would reach a verdict; ${m.changed} would change state.`);
  if (input.names) for (const d of m.details) out.push(`  ${d.name}: RX ${d.rx}, merged ${d.merged}`);

  h("6. Body context");
  if (input.scans && input.scans.length) {
    const b = bodyCoverage(rows, input.scans);
    out.push(`${b.scans} scans${b.medianGapDays !== null ? `, median gap ${b.medianGapDays} days` : ""}. Of ${b.rows} verdict rows, ${b.bothReadings} (${pct(b.bothReadings, b.rows)}) have body weight near both bests and ${b.oneOrNone} would read "No body weight within 21 days". ${b.movedPastBand} of the ${b.bothReadings} moved more than the 3 lb default band.`);
  } else out.push("No InBody file given (SWIFT_INBODY), so body-context coverage was not measured. Manual weigh-ins are not built yet.");

  h("7. Timeline entries");
  if (input.entries && input.entries.length) {
    for (const spec of input.entries) {
      const e = entryCheck(subjects, spec, asOf);
      const label = input.names ? spec.name : `Entry ${input.entries.indexOf(spec) + 1}`;
      out.push(`${label} (${spec.start} to ${spec.end ?? "ongoing"}): ${e.eligible} subjects compared (${e.up} up, ${e.down} down, ${e.nts} not tested since, ${e.nc} no clear change); ${e.eligible >= 3 ? "a verdict is reached" : "no verdict, needs 3"}; ${e.factsOnly} more have facts lines only.`);
    }
  } else out.push('No entries given. Pass SWIFT_ENTRIES="Name|YYYY-MM-DD|YYYY-MM-DD" (or "ongoing" for no end), separated by ";", to see how many reach a before and after.');
  return out.join("\n");
}
