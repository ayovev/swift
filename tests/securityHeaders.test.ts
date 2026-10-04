import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_DATASET_BYTES, Reassembler } from "@/lib/sync/chunking";

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("deployment headers", () => {
  const vercel = JSON.parse(read("vercel.json")) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  const csp = vercel.headers[0]!.headers.find((h) => h.key === "Content-Security-Policy")!.value;

  // The CSP allows exactly one inline script (the pre-hydration theme script) by
  // hash. Edit that script and this fails, instead of the page breaking in prod.
  it("hashes the inline script in index.html", () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(read("index.html"))![1]!;
    const hash = createHash("sha256").update(script).digest("base64");
    expect(csp).toContain(`'sha256-${hash}'`);
  });

  it("limits where data can be sent", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/connect-src 'self' https:\/\/us\.i\.posthog\.com/);
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

  it("rejects chunks that overrun the declared length", () => {
    const r = new Reassembler();
    r.feed(header(4));
    expect(() => r.feed(new Uint8Array(5))).toThrow();
  });
});
