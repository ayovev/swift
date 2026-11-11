import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No chart animates in. Recharts' default wipe takes about 1.2s and replays on every tab, grouping and range change, so for that
 * long a chart shows part of the data and reads as if the rest were missing (a share chart looked as if it ended a year early).
 * It explains no change, it only delays reading one. Reduced motion already turned it off; this turns it off for everyone.
 * A source check rather than a render check, because jsdom never runs the animation.
 */

const MARKS = ["Area", "Bar", "Line", "Scatter", "Pie", "Radar", "RadialBar", "Funnel"];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** Each opening tag of a Recharts series mark, up to its closing `>` (props may span lines and hold nested JSX). */
function markTags(source: string): string[] {
  if (!/from "recharts"/.test(source)) return [];
  const tags: string[] = [];
  const opener = new RegExp(`<(${MARKS.join("|")})(?=[\\s>/])`, "g");
  for (const match of source.matchAll(opener)) {
    let depth = 0;
    let i = match.index! + match[0].length;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index!, i + 1));
  }
  return tags;
}

describe("chart entry animation", () => {
  const root = join(process.cwd(), "src/components");
  const tags = tsxFiles(root).flatMap((file) => markTags(readFileSync(file, "utf8")).map((tag) => ({ file: relative(root, file), tag })));

  it("finds the charts it is checking", () => {
    expect(tags.length).toBeGreaterThan(8);
  });

  it("turns animation off on every Recharts series mark", () => {
    const animated = tags.filter(({ tag }) => !/isAnimationActive=\{false\}/.test(tag)).map(({ file, tag }) => `${file}: ${tag.split("\n")[0]}`);
    expect(animated).toEqual([]);
  });
});
