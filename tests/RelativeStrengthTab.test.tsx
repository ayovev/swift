import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelativeStrengthTab } from "@/components/dashboard/RelativeStrengthTab";
import type { LiftRelativeStrength, RelativeStrengthResult } from "@/lib/analytics/relativeStrength";

function lift(overrides: Partial<LiftRelativeStrength> = {}): LiftRelativeStrength {
  const dates = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"];
  return {
    lift: "Back Squat",
    rxStatus: "RX",
    status: "ok",
    attribution: "strength-driven",
    normalizedBy: "lean mass",
    reason: "Estimated 1RM up 12% (200 to 224) while lean mass stayed within normal scan variation.",
    series: dates.map((date, i) => ({
      date,
      e1rm: 200 + i * 8,
      perBodyweight: (200 + i * 8) / 180,
      perLeanMass: (200 + i * 8) / 140,
      bodyMatch: "exact" as const,
    })),
    ...overrides,
  };
}

const idle = { status: "idle" } as const;

describe("RelativeStrengthTab", () => {
  it("shows the upload state when there is no result yet", () => {
    const onFile = vi.fn();
    render(<RelativeStrengthTab relativeStrength={null} bodyComp={idle} onBodyCompFile={onFile} />);
    const dropzone = screen.getByRole("button", { name: "Upload your InBody CSV export" });
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("shows one card per eligible lift with its one-sentence attribution and a view toggle", () => {
    const result: RelativeStrengthResult = { status: "ok", lifts: [lift()] };
    render(<RelativeStrengthTab relativeStrength={result} bodyComp={idle} onBodyCompFile={() => {}} />);
    expect(screen.getByText("Back Squat (RX)")).toBeInTheDocument();
    expect(screen.getByText(/Estimated 1RM up 12%/)).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Back Squat chart view" });
    expect(group).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Per lean mass" }));
    expect(screen.getByRole("button", { name: "Per lean mass" })).toBeInTheDocument();
  });

  it("disables the lean-mass view when no session has a lean reading", () => {
    const l = lift();
    l.series = l.series.map((p) => ({ ...p, perLeanMass: null }));
    render(<RelativeStrengthTab relativeStrength={{ status: "ok", lifts: [l] }} bodyComp={idle} onBodyCompFile={() => {}} />);
    expect(screen.getByRole("button", { name: "Per lean mass" })).toBeDisabled();
  });

  it("lists lifts that fail eligibility collapsed, each with its reason", () => {
    const result: RelativeStrengthResult = {
      status: "ok",
      lifts: [
        lift(),
        lift({
          lift: "Deadlift",
          status: "insufficient",
          reason: "needs 2 more logged sessions in the last 365 days (has 2, needs 4)",
        }),
      ],
    };
    render(<RelativeStrengthTab relativeStrength={result} bodyComp={idle} onBodyCompFile={() => {}} />);
    const trigger = screen.getByText(/Not enough data yet \(1 lift\)/);
    expect(screen.queryByText(/needs 2 more logged sessions/)).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText(/Deadlift \(RX\)/)).toBeInTheDocument();
    expect(screen.getByText(/needs 2 more logged sessions/)).toBeInTheDocument();
  });

  it("states why nothing qualified when the whole result is insufficient", () => {
    render(
      <RelativeStrengthTab
        relativeStrength={{ status: "insufficient", reason: "no InBody scans to normalise against", lifts: [] }}
        bodyComp={idle}
        onBodyCompFile={() => {}}
      />
    );
    expect(screen.getByText(/No InBody scans to normalise against/)).toBeInTheDocument();
  });
});
