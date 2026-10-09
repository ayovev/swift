import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartInteractionProvider, selectionWindow, useChartInteraction, type ChartXSpan } from "@/components/dashboard/charts/chartInteraction";

const months: ChartXSpan[] = [
  { label: "Jan", start: "2026-01-01", end: "2026-01-31" },
  { label: "Feb", start: "2026-02-01", end: "2026-02-28" },
  { label: "Mar", start: "2026-03-01", end: "2026-03-31" },
  { label: "Apr", start: "2026-04-01", end: "2026-04-30" },
];

describe("selectionWindow", () => {
  it("spans every position between the two ends, whichever way the drag went", () => {
    expect(selectionWindow(months, 0, 2)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(selectionWindow(months, 3, 1)).toEqual({ start: "2026-02-01", end: "2026-04-30" });
  });
  it("selects nothing for a click without a drag or an out-of-range index", () => {
    expect(selectionWindow(months, 1, 1)).toBeNull();
    expect(selectionWindow(months, 1, 9)).toBeNull();
  });
});

function Probe({ xs }: { xs: ChartXSpan[] }) {
  const i = useChartInteraction(xs);
  return (
    <div>
      <button onClick={() => i.handlers.onMouseDown?.({ activeTooltipIndex: 0 })}>down0</button>
      <button onClick={() => i.handlers.onMouseMove?.({ activeTooltipIndex: 2 })}>move2</button>
      <button onClick={() => i.handlers.onMouseUp?.()}>up</button>
      {i.footer}
    </div>
  );
}

describe("useChartInteraction", () => {
  const value = { onCompare: vi.fn(), onTag: vi.fn() };

  it("offers nothing without a provider", () => {
    render(<Probe xs={months} />);
    fireEvent.click(screen.getByText("down0"));
    fireEvent.click(screen.getByText("move2"));
    fireEvent.click(screen.getByText("up"));
    expect(screen.queryByRole("group", { name: "Selected range" })).not.toBeInTheDocument();
  });

  it("commits a drag and offers Compare and Save as a period with the selected window", () => {
    render(
      <ChartInteractionProvider value={value}>
        <Probe xs={months} />
      </ChartInteractionProvider>
    );
    fireEvent.click(screen.getByText("down0"));
    fireEvent.click(screen.getByText("move2"));
    fireEvent.click(screen.getByText("up"));
    const group = screen.getByRole("group", { name: "Selected range" });
    expect(group).toHaveTextContent("Jan 1, 2026 – Mar 31, 2026");
    fireEvent.click(screen.getByRole("button", { name: /Compare with the 90 days before/ }));
    expect(value.onCompare).toHaveBeenCalledWith({ start: "2026-01-01", end: "2026-03-31" });
    fireEvent.click(screen.getByRole("button", { name: "Save as a period" }));
    expect(value.onTag).toHaveBeenCalledWith({ start: "2026-01-01", end: "2026-03-31" });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("group", { name: "Selected range" })).not.toBeInTheDocument();
  });
});
