import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import dayjs from "dayjs";
import { PeriodsTab } from "@/components/dashboard/PeriodsTab";
import type { DateWindow } from "@/types/compare";
import type { Experiment, ExperimentInsight } from "@/types/experiment";
import type { ContextTag } from "@/types/tag";
import { liftRow, scanRow } from "./fixtures/rows";

const md = (iso: string) => dayjs(iso).format("MM/DD/YYYY");
const workouts = [
  liftRow(md("2026-01-05"), "Back Squat", 200),
  liftRow(md("2026-01-20"), "Back Squat", 210),
  liftRow(md("2026-02-05"), "Back Squat", 220),
  liftRow(md("2026-02-20"), "Back Squat", 230),
];
const scans = [
  scanRow("2026-01-10", { "Weight(lb)": "180", "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "25", "Percent Body Fat(%)": "14" }),
  scanRow("2026-02-10", { "Weight(lb)": "181", "Soft Lean Mass(lb)": "142", "Body Fat Mass(lb)": "24", "Percent Body Fat(%)": "13.3" }),
];
const B: DateWindow = { start: "2026-02-01", end: "2026-02-28" };

function insight(overrides: Partial<ExperimentInsight> & { experiment: Experiment }): ExperimentInsight {
  return {
    classification: "improved",
    performanceSummary: { improvingCount: 2, decliningCount: 0, flatCount: 1, classifiedCount: 3 },
    bodyCompSummary: { leanMassDelta: 1, fatMassDelta: -1, bodyFatPctDelta: -0.4 },
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof PeriodsTab>;
function setup(props: Partial<Props> = {}) {
  const handlers = {
    onAddExperiment: vi.fn(),
    onUpdateExperiment: vi.fn(),
    onDeleteExperiment: vi.fn(),
    onBodyCompFile: vi.fn(),
  };
  render(
    <PeriodsTab
      workouts={workouts}
      scans={scans}
      tags={[]}
      experiments={[]}
      experimentInsights={new Map()}
      bodyComp={{ status: "ready", rows: [] }}
      initialWindowB={B}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe("PeriodsTab — comparing a range", () => {
  it("compares the range with the equal-length range before it and shows both tables", () => {
    setup();
    expect(screen.getByText(/Jan 4, 2026 – Jan 31, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Back Squat (RX)", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Better", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Lean mass")).toBeInTheDocument();
    // +2 lb lean is inside the default 3 lb band with only two scans.
    expect(screen.getAllByText(/within normal scan variation/).length).toBeGreaterThan(0);
  });

  it("lists subjects without enough entries collapsed, with the reason and no numbers", () => {
    setup({ workouts: [...workouts, liftRow(md("2026-01-06"), "Deadlift", 300), liftRow(md("2026-02-06"), "Deadlift", 320)] });
    expect(screen.queryByText(/window A needs 1 more logged entry/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Not enough entries to compare \(1\)/));
    expect(screen.getByText(/window A needs 1 more logged entry \(has 1, needs 2\)/)).toBeInTheDocument();
  });

  it("states why, and shows no numbers, when there is nothing to compare", () => {
    setup({ workouts: [], scans: [] });
    expect(screen.getByText(/Nothing to compare: no lift or benchmark was logged in either window/)).toBeInTheDocument();
  });

  it("re-runs when the dates are edited by keyboard", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Range starts"), { target: { value: "2026-02-10" } });
    expect(screen.getByText(/no lift or benchmark has 2 logged entries in both windows/)).toBeInTheDocument();
  });

  it("lets the earlier range be edited", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Choose the earlier range" }));
    expect(screen.getByLabelText("Earlier range starts")).toHaveValue("2026-01-04");
    fireEvent.change(screen.getByLabelText("Earlier range starts"), { target: { value: "2026-01-10" } });
    expect(screen.getByText(/Jan 10, 2026 – Jan 31, 2026/)).toBeInTheDocument();
  });

  it("names an overlapping tag in the caveats", () => {
    const tags: ContextTag[] = [{ id: "t", type: "travel", label: "Lisbon", startDate: "2026-02-10", endDate: "2026-02-14" }];
    setup({ tags });
    expect(screen.getByText(/Window B overlaps "Lisbon"/)).toBeInTheDocument();
  });
});

describe("PeriodsTab — what the range did", () => {
  it("reports volume and lift changes for whatever range is set, and states why a too-short one has nothing", () => {
    setup({ workouts, scans, initialWindowB: { start: "2026-02-01", end: "2026-02-05" } });
    expect(screen.getByText("In this range")).toBeInTheDocument();
    expect(screen.getByText(/needs 9 more days in this cycle \(has 5, needs 14\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Range starts"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Range ends"), { target: { value: "2026-02-28" } });
    expect(screen.getByText(/Back Squat estimated 1RM rose 15% \(200 to 230\)/)).toBeInTheDocument();
  });
});

describe("PeriodsTab — saving a comparison", () => {
  it("saves the range and the earlier range as an experiment", () => {
    const { onAddExperiment } = setup();
    expect(screen.getByText(/compared with the earlier\s+range shown above/)).toBeInTheDocument();
    expect(screen.queryByText(/the days between these two ranges/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New program" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as experiment" }));
    expect(onAddExperiment).toHaveBeenCalledWith({
      label: "New program",
      date: "2026-02-01",
      endDate: "2026-02-28",
      baselineStart: "2026-01-04",
    });
    expect(screen.getByRole("button", { name: "Saved as experiment" })).toBeDisabled();
  });

  it("warns that an earlier range with a gap before the range will gain the gap when saved", () => {
    const { onAddExperiment } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Choose the earlier range" }));
    fireEvent.change(screen.getByLabelText("Earlier range ends"), { target: { value: "2026-01-20" } });
    expect(screen.getByText(/the days between these two ranges will be included/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as experiment" }));
    expect(onAddExperiment).toHaveBeenCalledWith(expect.objectContaining({ baselineStart: "2026-01-04" }));
  });
});

describe("PeriodsTab — saved experiments", () => {
  const experiments: Experiment[] = [
    { id: "a", date: "2026-02-01", endDate: "2026-02-28", label: "Started 5/3/1 cycle" },
    { id: "b", date: "2025-08-15", endDate: "2025-10-01", label: "Switched to own programming" },
  ];

  it("says so when none have been logged", () => {
    setup();
    expect(screen.getByText("No experiments logged yet.")).toBeInTheDocument();
  });

  it("lists each with its dates and, once both datasets are loaded, its classification", () => {
    setup({
      experiments,
      experimentInsights: new Map([
        ["a", insight({ experiment: experiments[0]!, classification: "improved" })],
        ["b", insight({ experiment: experiments[1]!, classification: "mixed" })],
      ]),
    });
    expect(screen.getByText("Started 5/3/1 cycle")).toBeInTheDocument();
    expect(screen.getByText("Started Feb 1, 2026 · Ended Feb 28, 2026")).toBeInTheDocument();
    expect(screen.getByText("Improved")).toBeInTheDocument();
    expect(screen.getByText("Started Aug 15, 2025 · Ended Oct 1, 2025")).toBeInTheDocument();
    expect(screen.getByText("Mixed")).toBeInTheDocument();
  });

  it("fills the range in from an experiment and shows its verdict, compared with all earlier history", () => {
    setup({
      experiments,
      initialWindowB: null,
      experimentInsights: new Map([["a", insight({ experiment: experiments[0]!, classification: "improved" })]]),
    });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    expect(screen.getByLabelText("Range starts")).toHaveValue("2026-02-01");
    expect(screen.getByLabelText("Range ends")).toHaveValue("2026-02-28");
    expect(screen.getByText("All history before Feb 1, 2026", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Performance improved after this started, without body composition working against it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' })).toHaveAttribute("aria-pressed", "true");
    // The verdict card carries the experiment's name; the range report under it doesn't repeat it as a title.
    expect(screen.getAllByText("Started 5/3/1 cycle", { selector: "[data-slot=card-title]" })).toHaveLength(1);
    expect(screen.getByText("In this range")).toBeInTheDocument();
  });

  it("uses a saved comparison's own earlier range", () => {
    const withBaseline: Experiment = { id: "c", date: "2026-02-01", endDate: "2026-02-28", baselineStart: "2026-01-10", label: "Comparison" };
    setup({ experiments: [withBaseline], initialWindowB: null });
    expect(screen.getByText(/Compared with Jan 10, 2026 – Jan 31, 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Show "Comparison"' }));
    expect(screen.getAllByText(/Jan 10, 2026 – Jan 31, 2026/).length).toBeGreaterThan(1);
    expect(screen.getByLabelText("Earlier range starts")).toHaveValue("2026-01-10");
  });

  it("shows the specific reason for an insufficient_data verdict, and no numbers", () => {
    setup({
      experiments: [experiments[0]!],
      experimentInsights: new Map([
        [
          "a",
          insight({
            experiment: experiments[0]!,
            classification: "insufficient_data",
            reason: "needs 2 more lifts/WODs with logged data after this date (has 1, needs 3)",
          }),
        ],
      ]),
    });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    expect(screen.getByText("needs 2 more lifts/WODs with logged data after this date (has 1, needs 3)")).toBeInTheDocument();
    expect(screen.queryByText("Improving")).not.toBeInTheDocument();
    expect(screen.queryByText("Compared")).not.toBeInTheDocument();
  });

  it("asks for an InBody export, and forwards a dropped file, when a verdict needs one", () => {
    const { onBodyCompFile } = setup({
      experiments: [experiments[0]!],
      experimentInsights: null,
      bodyComp: { status: "idle" },
    });
    // The list and the comparison work without InBody data; only the verdict waits on it.
    expect(screen.getByText("Started 5/3/1 cycle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload your InBody CSV export" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    const dropzone = screen.getByRole("button", { name: "Upload your InBody CSV export" });
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onBodyCompFile).toHaveBeenCalledWith(file);
  });

  it("shows an error alert when the InBody upload failed", () => {
    setup({
      experiments: [experiments[0]!],
      experimentInsights: null,
      bodyComp: { status: "error", message: "That file is missing a date column." },
    });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    expect(screen.getByText("That file didn't work")).toBeInTheDocument();
    expect(screen.getByText("That file is missing a date column.")).toBeInTheDocument();
  });

  it("drops the experiment's verdict as soon as a date is typed", () => {
    setup({
      experiments,
      experimentInsights: new Map([["a", insight({ experiment: experiments[0]!, classification: "improved" })]]),
    });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    expect(screen.getByText(/Performance improved after this started/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Range ends"), { target: { value: "2026-02-27" } });
    expect(screen.queryByText(/Performance improved after this started/)).not.toBeInTheDocument();
  });

  it("calls onDeleteExperiment with the right id", () => {
    const { onDeleteExperiment } = setup({ experiments });
    fireEvent.click(screen.getByRole("button", { name: 'Delete "Switched to own programming"' }));
    expect(onDeleteExperiment).toHaveBeenCalledWith("b");
  });
});

describe("PeriodsTab — adding an experiment", () => {
  it("keeps the submit button disabled until both a date and a label are set", () => {
    setup();
    const submit = screen.getByRole("button", { name: "Add experiment" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Started 5/3/1 cycle"), { target: { value: "Switched to own programming" } });
    expect(submit).toBeDisabled();
  });

  it("submits with the picked start date and no end date when 'Ended' is left as 'Still ongoing'", () => {
    const { onAddExperiment } = setup();
    expect(screen.getByRole("button", { name: "Ended (optional)" })).toHaveTextContent("Still ongoing");
    fireEvent.click(screen.getByRole("button", { name: "Started" }));
    fireEvent.click(screen.getByRole("button", { name: /September 5th, 2026/ }));
    fireEvent.change(screen.getByPlaceholderText("Started 5/3/1 cycle"), { target: { value: "Started 5/3/1 cycle" } });
    fireEvent.click(screen.getByRole("button", { name: "Add experiment" }));
    expect(onAddExperiment).toHaveBeenCalledWith({ label: "Started 5/3/1 cycle", date: "2026-09-05" });
  });

  it("submits with both dates once an end date is also picked, and resets both fields after", () => {
    const { onAddExperiment } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Started" }));
    fireEvent.click(screen.getByRole("button", { name: /September 5th, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ended (optional)" }));
    fireEvent.click(screen.getByRole("button", { name: /September 10th, 2026/ }));
    expect(screen.getByRole("button", { name: /Ended \(optional\)/ })).toHaveTextContent("Sep 10, 2026");
    fireEvent.change(screen.getByPlaceholderText("Started 5/3/1 cycle"), { target: { value: "Tried a cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Add experiment" }));
    expect(onAddExperiment).toHaveBeenCalledWith({ label: "Tried a cut", date: "2026-09-05", endDate: "2026-09-10" });
    expect(screen.getByRole("button", { name: "Ended (optional)" })).toHaveTextContent("Still ongoing");
  });

  it("clears a picked end date via the 'Clear' button without touching the start date", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Ended (optional)" }));
    fireEvent.click(screen.getByRole("button", { name: /September 10th, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Ended \(optional\)/ })).toHaveTextContent("Still ongoing");
    expect(screen.getByRole("button", { name: "Started" })).toHaveTextContent("Pick a date");
  });
});

describe("PeriodsTab — editing an experiment", () => {
  const experiments: Experiment[] = [
    { id: "a", date: "2024-05-01", endDate: "2024-07-01", label: "Started 5/3/1 cycle" },
    { id: "b", date: "2024-08-15", label: "Switched to own programming" },
  ];
  const editForm = () => within(screen.getByRole("button", { name: "Save changes" }).closest("form")!);

  it("opens the form filled in with the experiment's label and dates", () => {
    setup({ experiments });
    fireEvent.click(screen.getByRole("button", { name: 'Edit "Started 5/3/1 cycle"' }));
    expect(screen.getByDisplayValue("Started 5/3/1 cycle")).toBeInTheDocument();
    expect(editForm().getByRole("button", { name: "Started" })).toHaveTextContent("May 1, 2024");
    expect(editForm().getByRole("button", { name: /^Ended/ })).toHaveTextContent("Jul 1, 2024");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("saves a new label under the same id and keeps the dates", () => {
    const { onUpdateExperiment } = setup({ experiments });
    fireEvent.click(screen.getByRole("button", { name: 'Edit "Switched to own programming"' }));
    fireEvent.change(screen.getByDisplayValue("Switched to own programming"), { target: { value: "Own programming, 4 days a week" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onUpdateExperiment).toHaveBeenCalledWith("b", { label: "Own programming, 4 days a week", date: "2024-08-15" });
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("makes an ended experiment ongoing again when its end date is cleared", () => {
    const { onUpdateExperiment } = setup({ experiments });
    fireEvent.click(screen.getByRole("button", { name: 'Edit "Started 5/3/1 cycle"' }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onUpdateExperiment).toHaveBeenCalledWith("a", { label: "Started 5/3/1 cycle", date: "2024-05-01" });
  });

  it("shows a saved comparison's earlier range in the list and keeps it through an edit", () => {
    const withBaseline: Experiment[] = [{ id: "c", date: "2024-05-01", endDate: "2024-06-01", baselineStart: "2024-04-01", label: "Comparison" }];
    const { onUpdateExperiment } = setup({ experiments: withBaseline });
    expect(screen.getByText(/Compared with Apr 1, 2024 – Apr 30, 2024/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Edit "Comparison"' }));
    fireEvent.change(screen.getByDisplayValue("Comparison"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onUpdateExperiment).toHaveBeenCalledWith("c", {
      label: "Renamed",
      date: "2024-05-01",
      endDate: "2024-06-01",
      baselineStart: "2024-04-01",
    });
  });

  it("goes back to all earlier history when the earlier range is cleared", () => {
    const withBaseline: Experiment[] = [{ id: "c", date: "2024-05-01", baselineStart: "2024-04-01", label: "Comparison" }];
    const { onUpdateExperiment } = setup({ experiments: withBaseline });
    fireEvent.click(screen.getByRole("button", { name: 'Edit "Comparison"' }));
    fireEvent.click(screen.getByRole("button", { name: "All history" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onUpdateExperiment).toHaveBeenCalledWith("c", { label: "Comparison", date: "2024-05-01" });
  });

  it("will not save an empty label", () => {
    setup({ experiments });
    fireEvent.click(screen.getByRole("button", { name: 'Edit "Started 5/3/1 cycle"' }));
    fireEvent.change(screen.getByDisplayValue("Started 5/3/1 cycle"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("cancel closes the form without saving", () => {
    const { onUpdateExperiment } = setup({ experiments });
    fireEvent.click(screen.getByRole("button", { name: 'Edit "Started 5/3/1 cycle"' }));
    fireEvent.change(screen.getByDisplayValue("Started 5/3/1 cycle"), { target: { value: "Something else" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onUpdateExperiment).not.toHaveBeenCalled();
    expect(screen.getByText("Started 5/3/1 cycle")).toBeInTheDocument();
  });
});

describe("PeriodsTab — training blocks", () => {
  const day = (n: number) => dayjs("2026-03-01").add(n, "day").format("YYYY-MM-DD");
  const blockWorkouts = [200, 205, 212, 218, 224, 230].map((v, i) => liftRow(md(day(i * 7)), "Back Squat", v));
  const blockScans = [
    scanRow(day(1), { "Weight(lb)": "190", "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "30" }),
    scanRow(day(20), { "Weight(lb)": "187", "Soft Lean Mass(lb)": "140.2", "Body Fat Mass(lb)": "27" }),
    scanRow(day(40), { "Weight(lb)": "184", "Soft Lean Mass(lb)": "140.5", "Body Fat Mass(lb)": "24" }),
  ];
  const cut: ContextTag = { id: "c", type: "cut", label: "Spring cut", startDate: day(0), endDate: day(42) };

  it("points to the Tags view when there are no blocks", () => {
    setup();
    expect(screen.getByText(/No blocks yet/)).toBeInTheDocument();
  });

  it("ignores injury and travel tags as blocks", () => {
    setup({ tags: [{ ...cut, type: "injury" }] });
    expect(screen.getByText(/No blocks yet/)).toBeInTheDocument();
  });

  it("lists each block tag, and shows its report with focus lifts and a lift table once picked", () => {
    setup({ workouts: blockWorkouts, scans: blockScans, tags: [cut], initialWindowB: null });
    expect(screen.getByText("Spring cut", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Show "Spring cut"' }));
    expect(screen.getByLabelText("Range starts")).toHaveValue(day(0));
    expect(screen.getByLabelText("Range ends")).toHaveValue(day(42));
    expect(screen.getByText("Spring cut", { selector: "[data-slot=card-title]" })).toBeInTheDocument();
    expect(screen.getByText(/Focus: Back Squat/)).toBeInTheDocument();
    expect(screen.getByText(/Back Squat estimated 1RM rose 15% \(200 to 230\)/)).toBeInTheDocument();
    expect(screen.getByText("Strength")).toBeInTheDocument();
  });
});
