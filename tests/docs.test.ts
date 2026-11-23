import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Markdown is checked against the code, so the commonest kind of rot (a file renamed, a heading reworded, an event removed) fails a test instead
 * of sitting in a document until someone is misled by it. Four checks:
 *  - every relative link resolves, and a link to a heading in a Markdown file finds that heading;
 *  - every path written in backticks (`src/...`, `tests/...`, `docs/...`, `scripts/...`, `public/...`) exists;
 *  - every quoted CLAUDE.md heading cited from a source or test comment (written as the file name, a comma, then the heading in quotes) names a
 *    heading that exists;
 *  - every analytics or sync event name written in backticks on a line about events exists in the code.
 * It checks that things exist, not that prose is true: it cannot catch a described behavior that changed. Keep documents free of figures that
 * drift (counts, measurements) for that reason, and say the rule rather than the number.
 */

const ROOT = process.cwd();

function walk(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist" || name === ".git") return [];
    return statSync(path).isDirectory() ? walk(path, keep) : keep(path) ? [path] : [];
  });
}

const MARKDOWN = [
  ...["README.md", "CLAUDE.md", "CONTRIBUTING.md", "SECURITY.md"].map((f) => join(ROOT, f)).filter(existsSync),
  ...walk(join(ROOT, "docs"), (p) => p.endsWith(".md")),
];
const read = (path: string): string => readFileSync(path, "utf8");
const rel = (path: string): string => relative(ROOT, path);

/** GitHub's heading anchor: lowercased, punctuation dropped, spaces to hyphens. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

function headings(markdown: string): string[] {
  let fenced = false;
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    else if (!fenced) {
      const m = /^#{1,6}\s+(.*)$/.exec(line);
      if (m) out.push(m[1]!.replace(/`/g, "").trim());
    }
  }
  return out;
}

/** Inline code and link targets, with fenced blocks left out. */
function outsideFences(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

describe("documentation links", () => {
  it("resolves every relative link, and finds the heading a link to a Markdown file names", () => {
    const problems: string[] = [];
    for (const file of MARKDOWN) {
      const text = outsideFences(read(file));
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1]!;
        if (/^(https?:|mailto:)/.test(target)) continue;
        const [pathPart, anchor] = target.split("#") as [string, string | undefined];
        const dest = pathPart === "" ? file : resolve(dirname(file), pathPart);
        if (!existsSync(dest)) {
          problems.push(`${rel(file)}: link to ${target} does not resolve`);
          continue;
        }
        if (anchor && dest.endsWith(".md") && !headings(read(dest)).map(slug).includes(anchor)) {
          problems.push(`${rel(file)}: ${target} names a heading that does not exist in ${rel(dest)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("documentation file paths", () => {
  it("only names files and folders that exist", () => {
    const problems: string[] = [];
    for (const file of MARKDOWN) {
      const text = outsideFences(read(file));
      for (const m of text.matchAll(/`((?:src|tests|docs|scripts|public)\/[^`\s]*)`/g)) {
        const raw = m[1]!;
        // Patterns and placeholders are not paths: `tests/**/*.test.ts(x)`, `src/<area>/`.
        if (/[*<>{}()|]/.test(raw)) continue;
        const path = raw.replace(/[.,:;]+$/, "");
        if (!existsSync(join(ROOT, path))) problems.push(`${rel(file)}: \`${raw}\` does not exist`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("headings cited from the code", () => {
  const claude = headings(read(join(ROOT, "CLAUDE.md")));

  it("names a CLAUDE.md heading that exists, wherever a comment cites one in quotes", () => {
    const sources = [...walk(join(ROOT, "src"), (p) => /\.tsx?$/.test(p)), ...walk(join(ROOT, "tests"), (p) => /\.tsx?$/.test(p))];
    const problems: string[] = [];
    for (const file of sources) {
      // A citation can wrap onto the next comment line; join the lines before looking.
      const text = read(file).replace(/\n\s*(?:\*|\/\/)\s?/g, " ");
      const patterns = [/CLAUDE\.md['’]?s?,?\s+"([^"]+)"/g, /"([^"]+)"\s+in\s+CLAUDE\.md/g];
      for (const re of patterns) {
        for (const m of text.matchAll(re)) {
          const cited = m[1]!.trim().toLowerCase();
          if (!claude.some((h) => h.toLowerCase().startsWith(cited))) {
            problems.push(`${rel(file)}: CLAUDE.md has no heading starting "${m[1]}"`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("finds at least one citation, so the check cannot pass by matching nothing", () => {
    const text = read(join(ROOT, "src/lib/analytics/pipeline.ts"));
    expect(text).toMatch(/CLAUDE\.md, "Architecture: the bundle split"/);
    expect(claude).toContain("Architecture: the bundle split");
  });
});

describe("event names in the documentation", () => {
  const codeFiles = [
    join(ROOT, "src/lib/posthog.ts"),
    join(ROOT, "src/lib/csv/parseCsv.ts"),
    ...walk(join(ROOT, "src/lib/sync"), (p) => p.endsWith(".ts")),
  ];
  const known = new Set(codeFiles.flatMap((f) => [...read(f).matchAll(/"([a-z]+(?:_[a-z]+)+)"/g)].map((m) => m[1]!)));

  // Names on an analytics line that are data fields or file formats, not events.
  const NOT_EVENTS = new Set([
    "swift_backup", "swift_audience", "swift_theme", "swift_brand", "interaction_used",
    // Fields of the dashboard output that share a line with the word "events".
    "all_workouts", "workout_lists",
  ]);

  it("only names analytics and sync events that exist", () => {
    const problems: string[] = [];
    for (const file of MARKDOWN) {
      for (const line of outsideFences(read(file)).split("\n")) {
        if (!/analytics|events?\b|interaction|SwiftEvent/i.test(line)) continue;
        for (const m of line.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
          const name = m[1]!;
          if (known.has(name) || NOT_EVENTS.has(name)) continue;
          // A CSV column or a data field named on the same line is not an event.
          if (/column|field|score_type|rx_or_scaled|best_result|barbell_lift/.test(line)) continue;
          problems.push(`${rel(file)}: \`${name}\` is not an event or reason in the code`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("reads a non-empty vocabulary from the code", () => {
    for (const name of ["upload_succeeded", "chart_view_toggled", "brand_saved", "backup_exported", "ice_timeout"]) {
      expect(known.has(name), name).toBe(true);
    }
  });
});
