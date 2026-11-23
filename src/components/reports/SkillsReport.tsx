import dayjs from "dayjs";
import { Square, SquareCheckBig } from "lucide-react";
import { modalityKeyLabel } from "@/components/dashboard/charts/chartUtils";
import { SKILL_LEVEL_LABEL, highestNewSkills, type SkillGroup, type SkillResult, type SkillsData } from "@/lib/analytics/skills";

const day = (iso: string): string => dayjs(iso).format("MMM D, YYYY");

/** A binary mark that never rests on color: a checked box (in the accent) or an empty one, and the words for a screen reader. */
function Mark({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex items-center text-accent-link">
      <SquareCheckBig className="size-4" aria-hidden="true" />
      <span className="sr-only">Done</span>
    </span>
  ) : (
    <span className="inline-flex items-center text-muted-foreground">
      <Square className="size-4" aria-hidden="true" />
      <span className="sr-only">Not yet</span>
    </span>
  );
}

function Group({ group, data, showOpen }: { group: SkillGroup; data: SkillsData; showOpen: boolean }) {
  const rows: SkillResult[] = showOpen ? group.results : group.results.filter((r) => r.through);
  if (rows.length === 0) return null;
  const hasStart = data.start !== null;
  return (
    <section data-testid={`skills-${group.modality}`}>
      <h3 className="report-heading text-lg font-semibold">{modalityKeyLabel(group.modality)}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {group.done} of {group.results.length} done as prescribed{hasStart ? `, ${group.newCount} new in this period` : ""}.
      </p>
      <table className="mt-2 w-full border-collapse text-left text-sm">
        <caption className="sr-only">{modalityKeyLabel(group.modality)} skills and whether each was done as prescribed</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="py-1 pr-2 font-medium">Skill</th>
            <th scope="col" className="hidden py-1 pr-2 font-medium sm:table-cell">Level</th>
            {hasStart ? <th scope="col" className="py-1 pr-2 text-center font-medium">Before {day(data.start!)}</th> : null}
            <th scope="col" className="py-1 pr-2 text-center font-medium">{hasStart ? `Through ${day(data.end)}` : "Done as prescribed"}</th>
            <th scope="col" className="hidden py-1 font-medium sm:table-cell">First done</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.skill.key} className="report-row border-b border-border align-top">
              <th scope="row" className="py-1.5 pr-2 font-medium">
                {r.skill.label}
                {r.isNew ? (
                  // A small chip in the sheet's accent (the brand color for a coach who set one). "New" is all that shows; the rest is for a screen reader.
                  <span
                    data-testid="skill-new"
                    className="ml-2 inline-flex items-center rounded-full border border-accent-border bg-accent-subtle px-1.5 align-middle text-[10px] leading-4 font-semibold text-accent-link"
                  >
                    New<span className="sr-only"> in this period</span>
                  </span>
                ) : null}
                {/* On a phone the level and the first workout sit under the name instead of in columns that would not fit. */}
                <span className="block text-xs font-normal text-muted-foreground break-words sm:hidden">
                  {SKILL_LEVEL_LABEL[r.skill.level]}
                  {r.first ? ` · ${day(r.first.date)}` : ""}
                </span>
              </th>
              <td className="hidden py-1.5 pr-2 text-muted-foreground sm:table-cell">{SKILL_LEVEL_LABEL[r.skill.level]}</td>
              {hasStart ? <td className="py-1.5 pr-2 text-center"><Mark done={r.before} /></td> : null}
              <td className="py-1.5 pr-2 text-center"><Mark done={r.through} /></td>
              <td className="hidden py-1.5 text-muted-foreground break-words sm:table-cell">{r.first ? day(r.first.date) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * The headline band: the change first (the report is about movement between two dates), then the total, one bar that draws the same
 * counts, a row per modality and the highest-level new skills. Counts only, in plain words; every mark in the bar is also written as a
 * number beside it, so nothing rests on color. The big number is the sheet's accent.
 */
function Headline({ data }: { data: SkillsData }) {
  const hasStart = data.start !== null;
  const before = hasStart ? data.done - data.newCount : 0;
  const open = data.total - data.done;
  const pct = (n: number) => `${(n / data.total) * 100}%`;
  const top = highestNewSkills(data);
  return (
    <section className="report-card border-b border-border pb-4" data-testid="skills-summary">
      {hasStart && data.newCount > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-5xl leading-none font-semibold tracking-tight text-accent-link" data-testid="skills-headline-number">{data.newCount}</span>{" "}
          <span className="text-xl font-semibold">new {plural(data.newCount, "skill", "skills")}</span>{" "}
          <span className="text-sm text-muted-foreground">since {day(data.start!)}</span>
        </p>
      ) : hasStart ? (
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-xl font-semibold" data-testid="skills-headline-number">No new skills in this period</span>{" "}
          <span className="text-sm text-muted-foreground">since {day(data.start!)}</span>
        </p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-5xl leading-none font-semibold tracking-tight text-accent-link" data-testid="skills-headline-number">{data.done}</span>{" "}
          <span className="text-xl font-semibold">of {data.total} skills done as prescribed</span>
        </p>
      )}
      {hasStart ? (
        <p className="mt-2 text-sm">
          {data.done} of {data.total} skills done as prescribed through {day(data.end)}.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Through {day(data.end)}.</p>
      )}

      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full border border-border" aria-hidden="true" data-testid="skills-bar">
        {/* Left to right in time: what was done before, then what is new, then what is not yet. */}
        {hasStart ? <div className="bg-accent-border" style={{ width: pct(before) }} /> : <div className="bg-primary" style={{ width: pct(data.done) }} />}
        {hasStart && data.newCount > 0 ? <div className="bg-primary" style={{ width: pct(data.newCount) }} /> : null}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground" data-testid="skills-bar-key">
        {hasStart ? (
          <>
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent-border" aria-hidden="true" />{before} done before</li>
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" aria-hidden="true" />{data.newCount} new</li>
          </>
        ) : (
          <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" aria-hidden="true" />{data.done} done</li>
        )}
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full border border-border" aria-hidden="true" />{open} not yet</li>
      </ul>

      <dl className="mt-4 grid grid-cols-3 gap-3" data-testid="skills-by-modality">
        {data.groups.map((g) => (
          <div key={g.modality}>
            <dt className="text-xs font-medium text-muted-foreground">{modalityKeyLabel(g.modality)}</dt>
            <dd className="text-sm">
              {hasStart ? <><span className="font-semibold text-accent-link">{g.newCount}</span> new · </> : null}
              {g.done} of {g.results.length}
            </dd>
          </div>
        ))}
      </dl>

      {top ? (
        <p className="mt-3 text-sm" data-testid="skills-newest">
          <span className="text-muted-foreground">Newest at {SKILL_LEVEL_LABEL[top.level]}:</span> {top.labels.join(", ")}
          {top.more > 0 ? ` and ${top.more} more` : ""}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The Skills report's body (docs/reports.md, "Skills report"): the fixed list of skills grouped M, W and G, each with a check when a
 * workout including it was logged RX. Counts only: no score, grade, badge or streak.
 */
export function SkillsReport({ data, showOpen }: { data: SkillsData; showOpen: boolean }) {
  return (
    <>
      <Headline data={data} />

      {data.groups.map((g) => (
        <Group key={g.modality} group={g} data={data} showOpen={showOpen} />
      ))}

      <p className="text-xs text-muted-foreground" data-testid="skills-note">
        A check means a workout that includes the movement was logged RX in SugarWOD. The RX flag covers the whole workout, and movements are read from the workout&apos;s text, so a check can be wrong either way. No check means none was logged RX, not that the athlete cannot do it.
      </p>
    </>
  );
}
