import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlateauTab } from "@/components/dashboard/PlateauTab";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import type { PlateauInsight } from "@/types/plateau";

function insight(overrides: Partial<PlateauInsight> & { subject: PlateauInsight["subject"] }): PlateauInsight {
  return {
    classification: "improving",
    windowStart: "2024-01-01",
    windowEnd: "2024-03-01",
    performanceTrend: { direction: "up", recentPoints: [{ date: "2024-03-01", value: 100 }] },
    confidence: "medium",
    ...overrides,
  };
}

describe("PlateauTab — empty state", () => {
  it("shows the upload dropzone and forwards a dropped file when no InBody data is loaded", () => {
    const onBodyCompFile = vi.fn();
    render(
      <PlateauTab
        plateauInsights={null}
        bodyComp={{ status: "idle" }}
        onBodyCompFile={onBodyCompFile}
      />
    );

    const dropzone = screen.getByRole("button", { name: "Upload your InBody CSV export" });
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onBodyCompFile).toHaveBeenCalledWith(file);
  });

  it("shows an error alert when the InBody upload failed", () => {
    const bodyComp: BodyCompState = { status: "error", message: "That file is missing a date column." };
    render(<PlateauTab plateauInsights={null} bodyComp={bodyComp} onBodyCompFile={vi.fn()} />);

    expect(screen.getByText("That file didn't work")).toBeInTheDocument();
    expect(screen.getByText("That file is missing a date column.")).toBeInTheDocument();
  });

  it("never shows a body-comp number before any InBody data has been loaded", () => {
    render(
      <PlateauTab plateauInsights={null} bodyComp={{ status: "idle" }} onBodyCompFile={vi.fn()} />
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("PlateauTab — ready state", () => {
  const insights: PlateauInsight[] = [
    insight({
      subject: { type: "lift", name: "Back Squat", status: "RX" },
      classification: "improving",
    }),
    insight({
      subject: { type: "lift", name: "Deadlift", status: "RX" },
      classification: "plateaued_body_comp",
      performanceTrend: { direction: "down", recentPoints: [{ date: "2024-03-01", value: 90 }] },
      bodyCompTrend: { leanMassDelta: -2, fatMassDelta: 1.5, bodyFatPctDelta: 0.6 },
    }),
    insight({
      subject: { type: "benchmark_wod", name: "Nancy", status: "SCALED" },
      classification: "plateaued_other",
      performanceTrend: { direction: "flat", recentPoints: [{ date: "2024-03-01", value: 900 }] },
      bodyCompTrend: { leanMassDelta: 1, fatMassDelta: -1, bodyFatPctDelta: -0.4 },
    }),
    insight({
      subject: { type: "benchmark_wod", name: "Grace", status: "RX" },
      classification: "insufficient_data",
      performanceTrend: { direction: "flat", recentPoints: [{ date: "2024-03-01", value: 291 }] },
    }),
  ];

  it("renders one row per insight with the correct classification label", () => {
    render(
      <PlateauTab
        plateauInsights={insights}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );

    expect(screen.getByText("Back Squat (RX)")).toBeInTheDocument();
    expect(screen.getByText("Improving")).toBeInTheDocument();
    expect(screen.getByText("Deadlift (RX)")).toBeInTheDocument();
    expect(screen.getByText("Plateaued — body comp")).toBeInTheDocument();
    expect(screen.getByText("Nancy (SCALED)")).toBeInTheDocument();
    expect(screen.getByText("Plateaued — other")).toBeInTheDocument();
    expect(screen.getByText("Grace (RX)")).toBeInTheDocument();
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
  });

  it("does not render fabricated body-comp numbers for an insufficient_data row", () => {
    render(
      <PlateauTab
        plateauInsights={insights}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );

    const graceRow = screen.getByText("Grace (RX)").closest("tr")!;
    expect(graceRow).toHaveTextContent("—");
    expect(graceRow).not.toHaveTextContent("Lean");
    expect(graceRow).not.toHaveTextContent("Fat mass");
  });
});
