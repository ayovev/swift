import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiftsTab } from "@/components/dashboard/LiftsTab";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import type { PlateauInsight } from "@/types/plateau";
import type { LiftRelativeStrength, RelativeStrengthResult } from "@/lib/analytics/relativeStrength";

function insight(overrides: Partial<PlateauInsight> & { subject: PlateauInsight["subject"] }): PlateauInsight {
  return {
    classification: "improving",
    windowStart: "2024-01-01",
    windowEnd: "2024-03-01",
    performanceTrend: {
      direction: "up",
      recentPoints: [{ date: "2024-03-01", value: 100 }],
      valueKind: "raw",
    },
    confidence: "medium",
    ...overrides,
  };
}

describe("LiftsTab — empty state", () => {
  it("shows the upload dropzone and forwards a dropped file when no InBody data is loaded", () => {
    const onBodyCompFile = vi.fn();
    render(
      <LiftsTab
        relativeStrength={null}
        plateauInsights={null}
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
    render(<LiftsTab relativeStrength={null} plateauInsights={null} alignment={null} bodyComp={bodyComp} onBodyCompFile={vi.fn()} />);

    expect(screen.getByText("That file didn't work")).toBeInTheDocument();
    expect(screen.getByText("That file is missing a date column.")).toBeInTheDocument();
  });

  it("never shows a body-comp number before any InBody data has been loaded", () => {
    render(
      <LiftsTab relativeStrength={null} plateauInsights={null} alignment={null} bodyComp={{ status: "idle" }} onBodyCompFile={vi.fn()} />
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("LiftsTab — ready state", () => {
  const insights: PlateauInsight[] = [
    insight({
      subject: { type: "lift", name: "Back Squat", status: "RX" },
      classification: "improving",
      performanceTrend: {
        direction: "up",
        recentPoints: [{ date: "2024-03-01", value: 220 }],
        valueKind: "estimated_1rm",
      },
    }),
    insight({
      subject: { type: "lift", name: "Deadlift", status: "RX" },
      classification: "plateaued_body_comp",
      performanceTrend: {
        direction: "down",
        recentPoints: [{ date: "2024-03-01", value: 90 }],
        valueKind: "estimated_1rm",
      },
      bodyCompTrend: { leanMassDelta: -2, fatMassDelta: 1.5, bodyFatPctDelta: 0.6 },
    }),
    insight({
      subject: { type: "benchmark_wod", name: "Nancy", status: "SCALED" },
      classification: "plateaued_other",
      performanceTrend: {
        direction: "flat",
        recentPoints: [{ date: "2024-03-01", value: 900 }],
        valueKind: "raw",
      },
      bodyCompTrend: { leanMassDelta: 1, fatMassDelta: -1, bodyFatPctDelta: -0.4 },
    }),
    insight({
      subject: { type: "benchmark_wod", name: "Grace", status: "RX" },
      classification: "insufficient_data",
      performanceTrend: {
        direction: "flat",
        recentPoints: [{ date: "2024-03-01", value: 291 }],
        valueKind: "raw",
      },
      reason: "needs 1 more logged entry (has 2, needs 3)",
    }),
  ];

  it("renders one row per insight with the correct classification label", () => {
    render(
      <LiftsTab
        relativeStrength={null}
        plateauInsights={insights}
        alignment={null}
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

  it("shows the specific reason for an insufficient_data row instead of a generic message", () => {
    render(
      <LiftsTab
        relativeStrength={null}
        plateauInsights={insights}
        alignment={null}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );

    expect(screen.getByText("needs 1 more logged entry (has 2, needs 3)")).toBeInTheDocument();
  });

  it("does not render fabricated body-comp numbers for an insufficient_data row", () => {
    render(
      <LiftsTab
        relativeStrength={null}
        plateauInsights={insights}
        alignment={null}
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

describe("LiftsTab — context tags and noise", () => {
  const ready: BodyCompState = { status: "ready", rows: [] };

  it("shows tag notes and the within-noise line on a plateaued row", () => {
    render(
      <LiftsTab
        alignment={null}
        relativeStrength={null}
        plateauInsights={[
          insight({
            subject: { type: "lift", name: "Back Squat", status: "RX" },
            classification: "plateaued_other",
            tagNotes: ['This plateau window overlaps "Winter cut" (cut, Jan 1, 2024 – ongoing); lifts and lean mass often move differently during a cut.'],
            bodyCompTrend: {
              leanMassDelta: -1,
              fatMassDelta: 1,
              bodyFatPctDelta: 0.3,
              withinNoise: { leanMass: true, fatMass: true, bodyFatPct: false },
            },
          }),
        ]}
        bodyComp={ready}
        onBodyCompFile={() => {}}
      />
    );
    expect(screen.getByText(/overlaps "Winter cut"/)).toBeInTheDocument();
    expect(screen.getByText("Lean mass and fat mass changes are within normal scan variation.")).toBeInTheDocument();
  });
});

describe("LiftsTab — alignment rollup", () => {
  const alignment = {
    classification: "tension" as const,
    performanceSummary: { improvingCount: 2, plateauedCount: 1, classifiedCount: 3 },
    bodyCompSummary: {
      leanMassDelta: 1,
      fatMassDelta: 4,
      bodyFatPctDelta: 1.5,
      windowStart: "2024-01-01",
      windowEnd: "2024-03-01",
    },
  };

  it("shows the whole-athlete read above the per-lift table", () => {
    render(
      <LiftsTab
        relativeStrength={null}
        plateauInsights={[insight({ subject: { type: "lift", name: "Back Squat", status: "RX" } })]}
        alignment={alignment}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );
    const badge = screen.getByText("Tension");
    const table = screen.getByRole("table");
    expect(badge.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no rollup when there is none", () => {
    render(
      <LiftsTab
        relativeStrength={null}
        plateauInsights={[insight({ subject: { type: "lift", name: "Back Squat", status: "RX" } })]}
        alignment={null}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
      />
    );
    expect(screen.queryByText("Tension")).not.toBeInTheDocument();
    expect(screen.queryByText("Aligned")).not.toBeInTheDocument();
  });
});

describe("LiftsTab — strength alongside plateaus", () => {
  const ready: BodyCompState = { status: "ready", rows: [] };
  const squat = insight({
    subject: { type: "lift", name: "Back Squat", status: "RX" },
    classification: "plateaued_other",
  });
  const bench = insight({ subject: { type: "lift", name: "Bench Press", status: "RX" } });
  const wod = insight({ subject: { type: "benchmark_wod", name: "Fran", status: "RX" } });

  function strengthLift(overrides: Partial<LiftRelativeStrength> = {}): LiftRelativeStrength {
    return {
      lift: "Back Squat",
      rxStatus: "RX",
      status: "ok",
      attribution: "mass-driven",
      normalizedBy: "bodyweight",
      reason: "Estimated 1RM up 8% (200 to 216) while bodyweight rose 7%.",
      series: [
        { date: "2026-01-05", e1rm: 200, perBodyweight: 1.1, perLeanMass: null, bodyMatch: "exact" },
        { date: "2026-04-05", e1rm: 216, perBodyweight: 1.12, perLeanMass: null, bodyMatch: "exact" },
      ],
      ...overrides,
    };
  }

  const result = (lifts: LiftRelativeStrength[]): RelativeStrengthResult => ({ status: "ok", lifts });

  it("shows a lift's strength read on its own plateau row, naming its window", () => {
    render(
      <LiftsTab
        plateauInsights={[squat]}
        alignment={null}
        relativeStrength={result([strengthLift()])}
        bodyComp={ready}
        onBodyCompFile={vi.fn()}
      />
    );
    const row = screen.getAllByRole("row").find((r) => within(r).queryByText(/Back Squat \(RX\)/) && within(r).queryByText(/Plateaued/))!;
    expect(within(row).getByText(/Per body mass, last 365 days: Mass/)).toBeInTheDocument();
  });

  it("leaves the strength line off a lift that did not qualify, a lift with no read, and a benchmark", () => {
    const { attribution: _dropped, ...rest } = strengthLift();
    const thin: LiftRelativeStrength = {
      ...rest,
      status: "insufficient",
      reason: "needs 4 more logged sessions in the last 365 days (has 0, needs 4)",
    };
    render(
      <LiftsTab
        plateauInsights={[squat, bench, wod]}
        alignment={null}
        relativeStrength={result([thin])}
        bodyComp={ready}
        onBodyCompFile={vi.fn()}
      />
    );
    expect(screen.queryByText(/Per body mass, last/)).not.toBeInTheDocument();
  });

  it("puts the strength charts under the plateau table, with a heading for each", () => {
    render(
      <LiftsTab
        plateauInsights={[squat]}
        alignment={null}
        relativeStrength={result([strengthLift()])}
        bodyComp={ready}
        onBodyCompFile={vi.fn()}
      />
    );
    const plateaus = screen.getByRole("heading", { name: "Plateaus" });
    const strength = screen.getByRole("heading", { name: "Strength per body mass" });
    expect(plateaus.compareDocumentPosition(strength) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("group", { name: "Back Squat chart view" })).toBeInTheDocument();
  });

  it("shows one upload prompt for the whole view, not one per section", () => {
    render(
      <LiftsTab
        plateauInsights={null}
        alignment={null}
        relativeStrength={null}
        bodyComp={{ status: "idle" }}
        onBodyCompFile={vi.fn()}
      />
    );
    expect(screen.getAllByRole("button", { name: "Upload your InBody CSV export" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Plateaus" })).not.toBeInTheDocument();
  });
});
