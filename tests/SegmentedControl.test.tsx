import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl, type SegmentedControlOption } from "@/components/dashboard/SegmentedControl";

// jsdom doesn't implement ResizeObserver; Radix Tooltip's arrow sizing needs
// one to mount at all, the same way tests/setup.ts polyfills IndexedDB.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

type Choice = "a" | "b";

const OPTIONS: readonly SegmentedControlOption<Choice>[] = [
  { id: "a", label: "A" },
  { id: "b", label: "B", disabled: true, title: "Not available right now — do X to enable it." },
];

describe("SegmentedControl", () => {
  it("renders a disabled option as an unclickable button", () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="a" onChange={onChange} options={OPTIONS} ariaLabel="Choice" />);

    const disabledButton = screen.getByRole("button", { name: "B" });
    expect(disabledButton).toBeDisabled();

    fireEvent.click(disabledButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the disabled option's reason in a tooltip on hover, since a disabled button can't carry a native title", () => {
    render(<SegmentedControl value="a" onChange={vi.fn()} options={OPTIONS} ariaLabel="Choice" />);

    expect(screen.queryByText(/not available right now/i)).not.toBeInTheDocument();

    const disabledButton = screen.getByRole("button", { name: "B" });
    // The disabled button itself is pointer-events-none, so the hover target
    // that actually triggers the tooltip is its focusable wrapper span.
    const trigger = disabledButton.closest("span[tabindex]");
    expect(trigger).not.toBeNull();

    fireEvent.focus(trigger!);
    screen.getByText(/not available right now/i);

    fireEvent.blur(trigger!);
    expect(screen.queryByText(/not available right now/i)).not.toBeInTheDocument();
  });

  it("does not wrap an enabled option in a tooltip trigger", () => {
    render(<SegmentedControl value="a" onChange={vi.fn()} options={OPTIONS} ariaLabel="Choice" />);

    const enabledButton = screen.getByRole("button", { name: "A" });
    expect(enabledButton.closest("span[tabindex]")).toBeNull();
  });
});
