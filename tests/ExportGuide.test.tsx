import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExportGuide } from "@/components/landing/ExportGuide";

describe("ExportGuide", () => {
  it("is collapsed until the athlete asks for it", () => {
    render(<ExportGuide />);

    const trigger = screen.getByRole("button", { name: /don't have your export yet/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/choose export workouts/i)).not.toBeInTheDocument();
  });

  it("opens to the SugarWOD steps by default, and switches to InBody's", () => {
    render(<ExportGuide />);

    fireEvent.click(screen.getByRole("button", { name: /don't have your export yet/i }));
    expect(screen.getByText(/choose export workouts/i)).toBeInTheDocument();

    // Radix's Tabs.Trigger activates on mousedown (or focus), not click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "InBody" }));
    expect(screen.getByText(/open the inbody app and go to your result history/i)).toBeVisible();
    expect(screen.queryByText(/choose export workouts/i)).not.toBeInTheDocument();
  });
});
