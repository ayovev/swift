import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_DATASET_BYTES, MAX_FRAMES_PER_DATASET, Reassembler } from "@/lib/sync/chunking";

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("deployment headers", () => {
  const vercel = JSON.parse(read("vercel.json")) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  const csp = vercel.headers[0]!.headers.find((h) => h.key === "Content-Security-Policy")!.value;

  // The CSP allows exactly one inline script (the pre-hydration theme script) by
  // hash. Edit that script and this fails, instead of the page breaking in prod.
  it("hashes the inline script in index.html", () => {
    const script = /<script>([\s\S]*?)<\/script\s*>/i.exec(read("index.html"))![1]!;
    const hash = createHash("sha256").update(script).digest("base64");
    expect(csp).toContain(`'sha256-${hash}'`);
  });

  it("limits where data can be sent", () => {
    expect(csp).toContain("default-src 'self'");
    const connect = /(?:^|; )connect-src ([^;]*)/.exec(csp)![1]!.split(" ").sort();
    expect(connect).toEqual(["'self'", "https://us-assets.i.posthog.com", "https://us.i.posthog.com"]);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  });
});

describe("sync frame size cap", () => {
  const header = (byteLength: number) =>
    new TextEncoder().encode(JSON.stringify({ dataset: "workout", byteLength, chunkCount: 1 }));

  it("rejects a header declaring more than the cap", () => {
    expect(() => new Reassembler().feed(header(MAX_DATASET_BYTES + 1))).toThrow(/more data/);
  });

  it("rejects a chunkCount that doesn't follow from byteLength", () => {
    const bad = new TextEncoder().encode(
      JSON.stringify({ dataset: "workout", byteLength: MAX_DATASET_BYTES, chunkCount: MAX_FRAMES_PER_DATASET + 1 }),
    );
    expect(() => new Reassembler().feed(bad)).toThrow(/chunkCount/);
    // Too few frames to carry that many bytes at the production chunk size.
    expect(() => new Reassembler().feed(header(MAX_DATASET_BYTES))).toThrow(/chunkCount/);
    // More frames than bytes means empty frames.
    const empty = new TextEncoder().encode(JSON.stringify({ dataset: "workout", byteLength: 2, chunkCount: 3 }));
    expect(() => new Reassembler().feed(empty)).toThrow(/chunkCount/);
  });

  it("does not keep a chunk that overruns", () => {
    const r = new Reassembler();
    r.feed(header(4));
    expect(() => r.feed(new Uint8Array(5))).toThrow();
    expect(r.receivedBytes).toBe(0);
  });

  it("rejects chunks that overrun the declared length", () => {
    const r = new Reassembler();
    r.feed(header(4));
    expect(() => r.feed(new Uint8Array(5))).toThrow();
  });
});
