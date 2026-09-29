import { describe, expect, it } from "vitest";
import { Reassembler, SyncFramingError, chunkPayload } from "@/lib/sync/chunking";

function feedAll(payload: ReturnType<typeof chunkPayload>) {
  const reassembler = new Reassembler();
  const results = [reassembler.feed(payload.headerBytes)];
  for (const chunk of payload.chunks) {
    results.push(reassembler.feed(chunk));
  }
  return results;
}

describe("chunkPayload", () => {
  it("round-trips a payload smaller than one chunk", () => {
    const json = JSON.stringify({ hello: "world" });
    const payload = chunkPayload("workout", json, 1024);
    const expectedByteLength = new TextEncoder().encode(json).byteLength;

    expect(payload.header).toEqual({ dataset: "workout", byteLength: expectedByteLength, chunkCount: 1 });

    const results = feedAll(payload);
    expect(results.slice(0, -1)).toEqual([{ done: false }]);
    expect(results.at(-1)).toEqual({ done: true, dataset: "workout", json });
  });

  it("round-trips a payload spanning many chunks, sized like the real sample export", () => {
    const rows = Array.from({ length: 1209 }, (_, i) => ({
      workout_id: `w${i}`,
      title: `Workout ${i}`,
      date: "01/01/2024",
    }));
    const json = JSON.stringify(rows);
    const payload = chunkPayload("workout", json, 512);

    expect(payload.chunks.length).toBeGreaterThan(1);
    expect(payload.header.chunkCount).toBe(payload.chunks.length);

    const results = feedAll(payload);
    expect(results.at(-1)).toEqual({ done: true, dataset: "workout", json });
  });

  it("handles an empty payload with zero chunks", () => {
    const payload = chunkPayload("bodyComp", "", 1024);
    expect(payload.header.chunkCount).toBe(0);
    expect(payload.chunks).toEqual([]);

    const reassembler = new Reassembler();
    expect(reassembler.feed(payload.headerBytes)).toEqual({ done: true, dataset: "bodyComp", json: "" });
  });

  it("round-trips an experiments payload", () => {
    const json = JSON.stringify([{ id: "1", date: "2024-01-01", label: "Started 5/3/1" }]);
    const payload = chunkPayload("experiments", json, 1024);

    const results = feedAll(payload);
    expect(results.at(-1)).toEqual({ done: true, dataset: "experiments", json });
  });

  it("round-trips a tags payload and a preferences payload", () => {
    const tags = JSON.stringify([{ id: "a", type: "cut", startDate: "2024-03-01", endDate: null }]);
    const prefs = JSON.stringify({ view: { granularity: "weekly", rangePreset: "all_time", customRange: null }, theme: { mode: "dark", accent: "teal" } });
    expect(feedAll(chunkPayload("tags", tags, 1024)).at(-1)).toEqual({ done: true, dataset: "tags", json: tags });
    expect(feedAll(chunkPayload("preferences", prefs, 16)).at(-1)).toEqual({ done: true, dataset: "preferences", json: prefs });
  });

  it("still rejects a dataset name it doesn't know", () => {
    const bad = new TextEncoder().encode(JSON.stringify({ dataset: "passwords", byteLength: 0, chunkCount: 0 }));
    expect(() => new Reassembler().feed(bad)).toThrow(/unknown dataset/);
  });

  it("rejects a non-positive maxChunkBytes", () => {
    expect(() => chunkPayload("workout", "{}", 0)).toThrow(RangeError);
  });
});

describe("Reassembler", () => {
  it("stays not-done while chunks remain outstanding", () => {
    const payload = chunkPayload("workout", JSON.stringify({ a: 1, b: 2, c: 3 }), 4);
    expect(payload.chunks.length).toBeGreaterThan(2);

    const reassembler = new Reassembler();
    reassembler.feed(payload.headerBytes);
    for (const chunk of payload.chunks.slice(0, -1)) {
      expect(reassembler.feed(chunk)).toEqual({ done: false });
    }
  });

  it("throws SyncFramingError when total received bytes don't match the declared byteLength", () => {
    const payload = chunkPayload("workout", JSON.stringify({ a: 1 }), 1024);
    const reassembler = new Reassembler();
    reassembler.feed(payload.headerBytes);
    const truncated = payload.chunks[0]!.slice(0, -1);

    expect(() => reassembler.feed(truncated)).toThrow(SyncFramingError);
  });

  it("throws SyncFramingError for a header that isn't valid JSON", () => {
    const reassembler = new Reassembler();
    expect(() => reassembler.feed(new TextEncoder().encode("not json"))).toThrow(SyncFramingError);
  });

  it("throws SyncFramingError for a header with an unknown dataset", () => {
    const reassembler = new Reassembler();
    const bogus = new TextEncoder().encode(JSON.stringify({ dataset: "movements", byteLength: 0, chunkCount: 0 }));
    expect(() => reassembler.feed(bogus)).toThrow(SyncFramingError);
  });

  it("throws SyncFramingError for a header missing required fields", () => {
    const reassembler = new Reassembler();
    const bogus = new TextEncoder().encode(JSON.stringify({ dataset: "workout" }));
    expect(() => reassembler.feed(bogus)).toThrow(SyncFramingError);
  });
});
