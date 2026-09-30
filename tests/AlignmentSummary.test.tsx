import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlignmentSummary } from "@/components/dashboard/AlignmentSummary";
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

describe("AlignmentSummary — ready state", () => {
  it("shows the aligned copy and summary numbers, without good/bad framing", () => {
    render(
      <AlignmentSummary
        alignment={result({ classification: "aligned" })}
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
      <AlignmentSummary
        alignment={result({ classification: "tension" })}
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
      <AlignmentSummary
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
      />
    );

    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByText("needs 1 more classified lift/WOD (has 2, needs 3)")).toBeInTheDocument();
    expect(screen.queryByText(/Comparison window/)).not.toBeInTheDocument();
  });
});

describe("AlignmentSummary — context tags and noise", () => {
  it("shows a sentence naming an overlapping tag, and nothing when there is none", () => {
    const { rerender } = render(
      <AlignmentSummary
        alignment={result({ tagNotes: ['This comparison window overlaps "Winter cut" (cut, Jan 1, 2024 – ongoing); lifts and lean mass often move differently during a cut.'] })}
      />
    );
    expect(screen.getByText(/overlaps "Winter cut"/)).toBeInTheDocument();
    rerender(<AlignmentSummary alignment={result()} />);
    expect(screen.queryByText(/overlaps/)).not.toBeInTheDocument();
  });

  it("says when body-comp changes are within normal scan variation", () => {
    render(
      <AlignmentSummary
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
      />
    );
    expect(screen.getByText("Lean mass, fat mass and body fat changes are within normal scan variation.")).toBeInTheDocument();
  });
});
