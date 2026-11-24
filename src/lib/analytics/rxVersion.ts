/**
 * The RX version of a SugarWOD workout description. A description often spells out every version of the workout, glued together:
 * "- RX -10 rounds for time:1 legless rope climb ...- INTERMEDIATE -10 rounds for time:1 rope climb ...- BEGINNER -3 pull-to-stands ...".
 * In the sample export that is 288 of the 958 RX-flagged workouts. The athlete's flag says which version they did, so for an RX workout
 * only the RX version is what was prescribed and done, and a movement that appears only in an easier version was not.
 *
 * The markers are SugarWOD's own uppercase level names between hyphens (`- RX -`, `- INTERMEDIATE -`, `- BEGINNER -`, `- SCALED -`,
 * `- FOUNDATIONS -`, `- JUST MOVE -`), matched case-sensitively so a movement written in lowercase never reads as a marker. Text before the
 * first marker is shared by every version and stays. With no markers the whole description is the one version. Used by the Skills report
 * only (docs/reports.md, R-21): it does not touch `ParsedRow`, `classifiableText()` or the parity fixture.
 */
const MARKER = /-\s*(RX|INTERMEDIATE|BEGINNER|SCALED|FOUNDATIONS|JUST MOVE)\s*-/g;

/** Whether the description spells out more than one version. */
export function hasVersions(description: string): boolean {
  MARKER.lastIndex = 0;
  return MARKER.test(description);
}

/** The shared preface plus the RX section; the whole description when it has no markers. A description with only lower versions keeps just its preface. */
export function rxVersionText(description: string): string {
  const marks = [...description.matchAll(MARKER)].map((m) => ({ name: m[1]!, start: m.index!, end: m.index! + m[0].length }));
  if (marks.length === 0) return description;
  const preface = description.slice(0, marks[0]!.start);
  const rx = marks.findIndex((m) => m.name === "RX");
  if (rx < 0) return preface;
  const stop = marks[rx + 1]?.start ?? description.length;
  return preface + " " + description.slice(marks[rx]!.end, stop);
}
