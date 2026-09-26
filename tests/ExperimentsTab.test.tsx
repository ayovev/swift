import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExperimentsTab } from "@/components/dashboard/ExperimentsTab";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import type { Experiment, ExperimentInsight } from "@/types/experiment";

function insight(overrides: Partial<ExperimentInsight> & { experiment: Experiment }): ExperimentInsight {
  return {
    classification: "improved",
    performanceSummary: { improvingCount: 2, decliningCount: 0, flatCount: 1, classifiedCount: 3 },
    bodyCompSummary: { leanMassDelta: 1, fatMassDelta: -1, bodyFatPctDelta: -0.4 },
    ...overrides,
  };
}

describe("ExperimentsTab — empty state", () => {
  it("shows the upload dropzone and forwards a dropped file when data isn't ready", () => {
    const onBodyCompFile = vi.fn();
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={null}
        bodyComp={{ status: "idle" }}
        onBodyCompFile={onBodyCompFile}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    const dropzone = screen.getByRole("button", { name: "Upload your InBody CSV export" });
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onBodyCompFile).toHaveBeenCalledWith(file);
  });

  it("shows an error alert when the InBody upload failed", () => {
    const bodyComp: BodyCompState = { status: "error", message: "That file is missing a date column." };
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={null}
        bodyComp={bodyComp}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    expect(screen.getByText("That file didn't work")).toBeInTheDocument();
    expect(screen.getByText("That file is missing a date column.")).toBeInTheDocument();
  });

  it("never shows the add-experiment form before data is ready", () => {
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={null}
        bodyComp={{ status: "idle" }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );
    expect(screen.queryByText("What did you try?")).not.toBeInTheDocument();
  });
});

describe("ExperimentsTab — ready state", () => {
  const experiments: Experiment[] = [
    { id: "a", date: "2024-05-01", label: "Started 5/3/1 cycle" },
    { id: "b", date: "2024-08-15", label: "Switched to own programming" },
  ];

  it("shows a message when no experiments have been logged yet", () => {
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={new Map()}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );
    expect(screen.getByText("No experiments logged yet.")).toBeInTheDocument();
  });

  it("renders one card per experiment with its label, date and classification", () => {
    const experimentInsights = new Map<string, ExperimentInsight>([
      ["a", insight({ experiment: experiments[0]!, classification: "improved" })],
      ["b", insight({ experiment: experiments[1]!, classification: "mixed" })],
    ]);
    render(
      <ExperimentsTab
        experiments={experiments}
        experimentInsights={experimentInsights}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    expect(screen.getByText("Started 5/3/1 cycle")).toBeInTheDocument();
    expect(screen.getByText("Started May 1, 2024")).toBeInTheDocument();
    expect(screen.getByText("Improved")).toBeInTheDocument();

    expect(screen.getByText("Switched to own programming")).toBeInTheDocument();
    expect(screen.getByText("Started Aug 15, 2024")).toBeInTheDocument();
    expect(screen.getByText("Mixed")).toBeInTheDocument();
  });

  it("shows the specific reason for an insufficient_data experiment instead of a generic message", () => {
    const experimentInsights = new Map<string, ExperimentInsight>([
      [
        "a",
        insight({
          experiment: experiments[0]!,
          classification: "insufficient_data",
          reason: "needs 2 more lifts/WODs with logged data after this date (has 1, needs 3)",
        }),
      ],
    ]);
    render(
      <ExperimentsTab
        experiments={[experiments[0]!]}
        experimentInsights={experimentInsights}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    expect(
      screen.getByText("needs 2 more lifts/WODs with logged data after this date (has 1, needs 3)")
    ).toBeInTheDocument();
  });

  it("does not render fabricated performance or body-comp numbers for an insufficient_data experiment", () => {
    const experimentInsights = new Map<string, ExperimentInsight>([
      [
        "a",
        insight({
          experiment: experiments[0]!,
          classification: "insufficient_data",
          reason: "needs 2 more lifts/WODs with logged data after this date (has 1, needs 3)",
        }),
      ],
    ]);
    render(
      <ExperimentsTab
        experiments={[experiments[0]!]}
        experimentInsights={experimentInsights}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    expect(screen.queryByText("Improving")).not.toBeInTheDocument();
    expect(screen.queryByText("Compared")).not.toBeInTheDocument();
  });

  it("calls onDeleteExperiment with the right id when its delete button is clicked", () => {
    const onDeleteExperiment = vi.fn();
    const experimentInsights = new Map<string, ExperimentInsight>([
      ["a", insight({ experiment: experiments[0]! })],
      ["b", insight({ experiment: experiments[1]! })],
    ]);
    render(
      <ExperimentsTab
        experiments={experiments}
        experimentInsights={experimentInsights}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={onDeleteExperiment}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: 'Delete "Switched to own programming"' }));
    expect(onDeleteExperiment).toHaveBeenCalledWith("b");
  });

  it("keeps the submit button disabled until both a date and a label are set", () => {
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={new Map()}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    const submit = screen.getByRole("button", { name: "Add experiment" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Started 5/3/1 cycle"), {
      target: { value: "Switched to own programming" },
    });
    expect(submit).toBeDisabled();
  });

  it("shows both dates on a card whose experiment has an end date", () => {
    const withEnd: Experiment = { id: "c", date: "2024-05-01", endDate: "2024-09-15", label: "Ran a cut" };
    render(
      <ExperimentsTab
        experiments={[withEnd]}
        experimentInsights={new Map([["c", insight({ experiment: withEnd })]])}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    expect(screen.getByText("Started May 1, 2024 · Ended Sep 15, 2024")).toBeInTheDocument();
  });

  it("submits with the picked start date and no end date when 'Ended' is left as 'Still ongoing'", () => {
    const onAddExperiment = vi.fn();
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={new Map()}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={onAddExperiment}
        onDeleteExperiment={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Ended (optional)" })).toHaveTextContent("Still ongoing");

    fireEvent.click(screen.getByRole("button", { name: "Started" }));
    fireEvent.click(screen.getByRole("button", { name: /September 5th, 2026/ }));
    fireEvent.change(screen.getByPlaceholderText("Started 5/3/1 cycle"), {
      target: { value: "Started 5/3/1 cycle" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add experiment" }));

    expect(onAddExperiment).toHaveBeenCalledWith("Started 5/3/1 cycle", "2026-09-05", undefined);
  });

  it("submits with both dates once an end date is also picked, and resets both fields after", () => {
    const onAddExperiment = vi.fn();
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={new Map()}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={onAddExperiment}
        onDeleteExperiment={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Started" }));
    fireEvent.click(screen.getByRole("button", { name: /September 5th, 2026/ }));

    fireEvent.click(screen.getByRole("button", { name: "Ended (optional)" }));
    fireEvent.click(screen.getByRole("button", { name: /September 10th, 2026/ }));
    expect(screen.getByRole("button", { name: /Ended \(optional\)/ })).toHaveTextContent("Sep 10, 2026");

    fireEvent.change(screen.getByPlaceholderText("Started 5/3/1 cycle"), {
      target: { value: "Tried a cut" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add experiment" }));

    expect(onAddExperiment).toHaveBeenCalledWith("Tried a cut", "2026-09-05", "2026-09-10");

    // Fields reset for the next entry, same as the label already did before this feature.
    expect(screen.getByRole("button", { name: "Ended (optional)" })).toHaveTextContent("Still ongoing");
  });

  it("clears a picked end date via the 'Clear' button without touching the start date", () => {
    render(
      <ExperimentsTab
        experiments={[]}
        experimentInsights={new Map()}
        bodyComp={{ status: "ready", rows: [] }}
        onBodyCompFile={vi.fn()}
        onAddExperiment={vi.fn()}
        onDeleteExperiment={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Ended (optional)" }));
    fireEvent.click(screen.getByRole("button", { name: /September 10th, 2026/ }));
    expect(screen.getByRole("button", { name: /Ended \(optional\)/ })).toHaveTextContent("Sep 10, 2026");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Ended \(optional\)/ })).toHaveTextContent("Still ongoing");
    expect(screen.getByRole("button", { name: "Started" })).toHaveTextContent("Pick a date");
  });
});
