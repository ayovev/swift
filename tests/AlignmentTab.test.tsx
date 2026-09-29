import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlignmentTab } from "@/components/dashboard/AlignmentTab";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import type { AlignmentResult } from "@/types/alignment";

function result(overrides: Partial<AlignmentResult> = {}): AlignmentResult {
  return {
    classification: "aligned",
    performanceSummary: { improvingCount: 3, plateauedCount: 1, classifiedCount: 4 },
    bodyCompSummary: {
      leanMassDelta: 2,
      fatMassDelta: -1,
      bodyFatPctDelta: -0.5,
      windowStart: "2024-01-01",
      windowEnd: "2024-03-01",
    },
    ...overrides,
  };
}

describe("AlignmentTab — empty state", () => {
  it("shows the upload dropzone and forwards a dropped file when no InBody data is loaded", () => {
    const onBodyCompFile = vi.fn();
    render(
      <AlignmentTab
        alignment={null}
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
    render(<AlignmentTab alignment={null} bodyComp={bodyComp} onBodyCompFile={vi.fn()} />);

    expect(screen.getByText("That file didn't work")).toBeInTheDocument();
    expect(screen.getByText("That file is missing a date column.")).toBeInTheDocument();
  });
});

describe("AlignmentTab — ready state", () => {
  it("shows the aligned copy and summary numbers, without good/bad framing", () => {
    render(
      <AlignmentTab
        alignment={result({ classification: "aligned" })}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );

    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(
      screen.getByText("Your performance and body composition are telling a consistent story right now.")
    ).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // improvingCount
  });

  it("shows the tension copy", () => {
    render(
      <AlignmentTab
        alignment={result({ classification: "tension" })}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );

    expect(screen.getByText("Tension")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your performance and body composition are moving in different directions — might be worth understanding why."
      )
    ).toBeInTheDocument();
  });

  it("surfaces the reason directly for insufficient_data, not a generic message", () => {
    render(
      <AlignmentTab
        alignment={result({
          classification: "insufficient_data",
          reason: "needs 1 more classified lift/WOD (has 2, needs 3)",
          bodyCompSummary: {
            leanMassDelta: null,
            fatMassDelta: null,
            bodyFatPctDelta: null,
            windowStart: "",
            windowEnd: "",
          },
        })}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );

    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByText("needs 1 more classified lift/WOD (has 2, needs 3)")).toBeInTheDocument();
    expect(screen.queryByText(/Comparison window/)).not.toBeInTheDocument();
  });
});

describe("AlignmentTab — context tags and noise", () => {
  it("shows a sentence naming an overlapping tag, and nothing when there is none", () => {
    const { rerender } = render(
      <AlignmentTab
        alignment={result({ tagNotes: ['This comparison window overlaps "Winter cut" (cut, Jan 1, 2024 – ongoing); lifts and lean mass often move differently during a cut.'] })}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={() => {}}
      />
    );
    expect(screen.getByText(/overlaps "Winter cut"/)).toBeInTheDocument();
    rerender(<AlignmentTab alignment={result()} bodyComp={{ status: "ready", rows: [] }} onBodyCompFile={() => {}} />);
    expect(screen.queryByText(/overlaps/)).not.toBeInTheDocument();
  });

  it("says when body-comp changes are within normal scan variation", () => {
    render(
      <AlignmentTab
        alignment={result({
          bodyCompSummary: {
            leanMassDelta: 1,
            fatMassDelta: -1,
            bodyFatPctDelta: -0.2,
            windowStart: "2024-01-01",
            windowEnd: "2024-03-01",
            withinNoise: { leanMass: true, fatMass: true, bodyFatPct: true },
          },
        })}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={() => {}}
      />
    );
    expect(screen.getByText("Lean mass, fat mass and body fat changes are within normal scan variation.")).toBeInTheDocument();
  });
});
