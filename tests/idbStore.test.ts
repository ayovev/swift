import { afterEach, describe, expect, it } from "vitest";
import { idbClearAll, idbGet, idbSet } from "@/lib/storage/idbStore";

afterEach(async () => {
  await idbClearAll();
});

describe("idbStore", () => {
  it("resolves undefined for a key that was never set", async () => {
    expect(await idbGet("missing")).toBeUndefined();
  });

  it("round-trips a value through set and get", async () => {
    await idbSet("a", { hello: "world" });
    expect(await idbGet("a")).toEqual({ hello: "world" });
  });

  it("replaces the previous value when a key is set again", async () => {
    await idbSet("a", "first");
    await idbSet("a", "second");
    expect(await idbGet("a")).toBe("second");
  });

  it("removes every key with idbClearAll", async () => {
    await idbSet("a", "1");
    await idbSet("b", "2");
    await idbClearAll();
    expect(await idbGet("a")).toBeUndefined();
    expect(await idbGet("b")).toBeUndefined();
  });
});
