import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The production bundle is split (see CLAUDE.md, "Architecture: the bundle split"). A split is undone by one innocent static
 * import, and nothing else would notice: the app works the same, only the first load grows. This reads the source and fails
 * when a module that is meant to be a separate chunk is imported by anything but its one lazy seam.
 *
 * `import type` is erased at build time and is fine anywhere.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const SRC = join(process.cwd(), "src");
const sources = files(SRC).map((f) => ({ file: f.slice(SRC.length + 1), text: readFileSync(f, "utf8") }));

/** Files that statically (value) import a module whose path ends in `name`. */
function staticImporters(name: string): string[] {
  const re = new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s+["'][^"']*/${name}["']`, "m");
  return sources.filter((s) => re.test(s.text)).map((s) => s.file);
}

describe("the bundle split", () => {
  it("keeps the dashboard out of the upload screen's chunk", () => {
    expect(staticImporters("Dashboard")).toEqual([]);
    expect(sources.find((s) => s.file === "App.tsx")!.text).toMatch(/import\("@\/components\/dashboard\/Dashboard"\)/);
  });

  it.each(["WorkoutsTab", "LiftHistoryTab", "DomainTab", "ModalityTab", "MovementsTab", "BodyCompTab", "LiftsTab", "TimelineTab"])(
    "loads %s only through lazyViews.ts",
    (view) => {
      expect(staticImporters(view)).toEqual([]);
      expect(sources.find((s) => s.file === "components/dashboard/lazyViews.ts")!.text).toContain(`import("./${view}")`);
    }
  );

  it("keeps Overview, the landing view, in the main chunk", () => {
    expect(staticImporters("OverviewTab")).toEqual(["components/dashboard/Dashboard.tsx"]);
  });

  it("loads the sync wizard (QR scanner, QR generator, WebRTC) only when it is first opened", () => {
    expect(staticImporters("SyncDialog")).toEqual([]);
    for (const heavy of ["jsqr", "qrcode"]) {
      const importers = sources.filter((s) => new RegExp(`from\\s+["']${heavy}["']`).test(s.text)).map((s) => s.file);
      expect(importers, heavy).toEqual(["components/sync/" + (heavy === "jsqr" ? "QrScanner.tsx" : "QrDisplay.tsx")]);
    }
    // Everything that reaches those two is itself reached only through SyncDialog.
    expect(staticImporters("webrtcTransport")).toEqual(["components/sync/useSyncSession.ts"]);
    expect(staticImporters("useSyncSession")).toEqual(["components/sync/SyncDialog.tsx"]);
  });

  it("loads PostHog after the first paint, never with the page", () => {
    const importers = sources.filter((s) => /^\s*import\s+(?!type\b)[^;]*?from\s+["']posthog-js["']/m.test(s.text)).map((s) => s.file);
    expect(importers).toEqual([]);
    expect(sources.find((s) => s.file === "lib/posthog.ts")!.text).toMatch(/import\("posthog-js"\)/);
  });

  it("keeps the classify/analytics pipeline out of the first load", () => {
    // Walk what the entry point reaches through static value imports (dynamic import() and `import type` are not edges).
    // One innocent import from a module the upload screen uses (this chain once ran weighIns -> bodyContext -> display -> sessions
    // -> liftSubjects -> buildDashboardData -> the lexicon) puts ~40 kB back into every visit's first load.
    const byFile = new Map(sources.map((s) => [s.file, s.text]));
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? join(from, "..", spec).replace(/\\/g, "/") : null;
      if (base === null) return null;
      return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((c) => byFile.has(c)) ?? null;
    };
    const edge = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm;
    const sideEffect = /^\s*import\s+["']([^"']+)["']/gm;
    const seen = new Set<string>();
    const stack = ["main.tsx"];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const text = byFile.get(f)!;
      for (const re of [edge, sideEffect]) {
        for (const m of text.matchAll(re)) {
          const next = resolve(f, m[1]!);
          if (next) stack.push(next);
        }
      }
    }
    const leaked = [...seen].filter((f) => f.startsWith("lib/classify/") || /analytics\/(buildInsights|buildDashboardData|buildModalityData|buildMovementData|liftSubjects)\.ts$/.test(f));
    expect(leaked).toEqual([]);
    // And the one seam that does reach it is a dynamic import.
    expect(sources.find((s) => s.file === "lib/analytics/pipeline.ts")!.text).toMatch(/import\("@\/lib\/analytics\/buildInsights"\)/);
    expect(staticImporters("buildInsights")).toEqual([]);
  });
});
