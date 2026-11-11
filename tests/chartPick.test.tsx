import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartPickNote, useBucketPick, usePointPick } from "@/components/dashboard/charts/ChartPick";
import { triggerLabel } from "@/components/dashboard/DateRangePicker";
import { WorkoutList } from "@/components/dashboard/WorkoutList";
import type { Granularity } from "@/lib/analytics/granularity";

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/posthog", async (orig) => ({ ...(await orig<typeof import("@/lib/posthog")>()), capture: posthog.capture }));

/**
 * Picking a chart point (ChartPick.tsx). jsdom lays nothing out, so Recharts draws no chart here and the pointer itself is exercised
 * in a real browser; these pin the rules underneath: what a release, Enter and Escape pick, how a list row is matched to a bucket,
 * what the note and the narrowed list say, and that analytics hears only that a point was picked.
 */

/** requestAnimationFrame run straight away, so the two-frame wait in onPointerUp resolves inside the test. */
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  posthog.capture.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const pointerUp = (target: Element = document.body, button = 0) =>
  ({ button, target }) as unknown as Parameters<ReturnType<typeof usePointPick>["onPointerUp"]>[0];
const key = (k: string) => ({ key: k, preventDefault: () => {} }) as unknown as Parameters<ReturnType<typeof usePointPick>["onKeyDown"]>[0];

describe("usePointPick", () => {
  it("picks the point the tooltip is showing when the pointer is released, and toggles it off on a second release", () => {
    const onPick = vi.fn();
    const { result, rerender } = renderHook(({ picked }) => usePointPick<string>(onPick, picked), { initialProps: { picked: null as string | null } });
    result.current.track("2024-06");
    result.current.onPointerUp(pointerUp());
    expect(onPick).toHaveBeenLastCalledWith("2024-06");
    rerender({ picked: "2024-06" });
    result.current.track("2024-06");
    result.current.onPointerUp(pointerUp());
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("ignores any button but the primary one, and a release with nothing under it", () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => usePointPick<string>(onPick, null));
    result.current.onPointerUp(pointerUp());
    result.current.track("2024-06");
    result.current.onPointerUp(pointerUp(document.body, 2));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("keeps the point shown at release when the tooltip hides before the pick runs (a scatter on a tap)", () => {
    const onPick = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      setTimeout(() => cb(0), 0);
      return 0;
    });
    vi.useFakeTimers();
    const { result } = renderHook(() => usePointPick<string>(onPick, null));
    result.current.track("2023-06-21");
    result.current.onPointerUp(pointerUp());
    result.current.track(null);
    vi.runAllTimers();
    vi.useRealTimers();
    expect(onPick).toHaveBeenCalledWith("2023-06-21");
  });

  it("picks a mark that names its own point, whatever the tooltip says", () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => usePointPick<string>(onPick, null));
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    mark.setAttribute("data-pick", "2023-07-21");
    result.current.track("2022-11");
    result.current.onPointerUp(pointerUp(mark));
    expect(onPick).toHaveBeenCalledWith("2023-07-21");
  });

  it("picks with Enter or Space and clears with Escape, for a keyboard moving the tooltip with the arrows", () => {
    const onPick = vi.fn();
    const { result, rerender } = renderHook(({ picked }) => usePointPick<string>(onPick, picked), { initialProps: { picked: null as string | null } });
    result.current.onKeyDown(key("Enter"));
    expect(onPick).not.toHaveBeenCalled();
    result.current.track("2023-01");
    result.current.onKeyDown(key("Enter"));
    expect(onPick).toHaveBeenLastCalledWith("2023-01");
    result.current.track("2023-02");
    result.current.onKeyDown(key(" "));
    expect(onPick).toHaveBeenLastCalledWith("2023-02");
    rerender({ picked: "2023-02" });
    result.current.onKeyDown(key("Escape"));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("does nothing on a chart that doesn't pick", () => {
    const { result } = renderHook(() => usePointPick<string>(undefined, null));
    result.current.track("2024-06");
    expect(() => {
      result.current.onPointerUp(pointerUp());
      result.current.onKeyDown(key("Enter"));
    }).not.toThrow();
  });
});

describe("useBucketPick", () => {
  it("matches a list row's date to the bucket parseRows gave it, at every grouping", () => {
    const cases: [Granularity, string, string][] = [
      ["monthly", "2024-10", "24-10-03"],
      ["quarterly", "2024-Q4", "24-11-30"],
      ["yearly", "2024", "24-02-01"],
      ["daily", "2024-10-03", "24-10-03"],
    ];
    for (const [granularity, bucket, date] of cases) {
      const { result } = renderHook(() => useBucketPick(granularity, "x"));
      act(() => result.current.pick(bucket));
      expect(result.current.inPicked(date), `${granularity} ${date}`).toBe(true);
      expect(result.current.inPicked("23-01-01")).toBe(false);
    }
  });

  it("labels the pick the way the axis does, and clears it when the grouping or the data changes", () => {
    const { result, rerender } = renderHook(({ g, data }) => useBucketPick(g, data), { initialProps: { g: "monthly" as Granularity, data: "a" } });
    act(() => result.current.pick("2024-10"));
    expect(result.current.label).toBe("Oct '24");
    rerender({ g: "quarterly", data: "a" });
    expect(result.current.picked).toBeNull();
    act(() => result.current.pick("2024-Q4"));
    rerender({ g: "quarterly", data: "b" });
    expect(result.current.picked).toBeNull();
  });

  it("tells analytics only that a point was picked, never which", () => {
    const { result } = renderHook(() => useBucketPick("monthly", "x"));
    act(() => result.current.pick("2024-10"));
    act(() => result.current.pick(null));
    expect(posthog.capture.mock.calls).toEqual([[{ name: "interaction_used", props: { interaction: "chart_point_selected" } }]]);
    expect(JSON.stringify(posthog.capture.mock.calls)).not.toMatch(/2024|Oct/);
  });
});

describe("ChartPickNote", () => {
  it("says what was picked, offers what to do next, and clears", () => {
    const onClear = vi.fn();
    const onClick = vi.fn();
    render(
      <ChartPickNote onClear={onClear} action={{ label: "List them", onClick }}>
        Oct '24: 9 of 15 workouts
      </ChartPickNote>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Oct '24: 9 of 15 workouts");
    fireEvent.click(screen.getByRole("button", { name: "List them" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe("WorkoutList narrowed to a picked point", () => {
  const rows = [{ date: "24-10-03", title: "FRAN", reason: "thrusters" }];

  it("names the point and offers every workout back", () => {
    const onClear = vi.fn();
    render(<WorkoutList rows={rows} emptyMessage="none" scope={{ label: "Oct '24", onClear }} />);
    expect(screen.getByText("FRAN")).toBeInTheDocument();
    expect(screen.getByText("Oct '24")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show every workout" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe("the date range label", () => {
  it("reads one day as that day, and keeps a month name's capital", () => {
    const day = { start: dayjs("2023-06-21").startOf("day"), end: dayjs("2023-06-21").endOf("day") };
    expect(triggerLabel("custom", day)).toBe("Jun 21, 2023");
    const month = { start: dayjs("2026-06-01").startOf("day"), end: dayjs("2026-06-30").endOf("day") };
    expect(triggerLabel("custom", month)).toBe("Jun 1, 2026 – Jun 30, 2026");
  });
});
