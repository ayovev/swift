import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import dayjs from "dayjs";
import { CompareTab } from "@/components/dashboard/CompareTab";
import type { DateWindow } from "@/types/compare";
import type { ExperimentInsight } from "@/types/experiment";
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

function insight(id: string, overrides: Partial<ExperimentInsight> = {}): ExperimentInsight {
  return {
    experiment: { id, date: "2026-02-01", label: "x" },
    classification: "improved",
    performanceSummary: { improvingCount: 2, decliningCount: 0, flatCount: 1, classifiedCount: 3 },
    bodyCompSummary: { leanMassDelta: 1, fatMassDelta: -1, bodyFatPctDelta: -0.4 },
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof CompareTab>;
function setup(props: Partial<Props> = {}) {
  const handlers = { onAddTag: vi.fn(), onBodyCompFile: vi.fn() };
  render(
    <CompareTab
      workouts={workouts}
      scans={scans}
      tags={[]}
      experimentInsights={new Map()}
      bodyComp={{ status: "ready", rows: [] }}
      initialWindowB={B}
      initialTagId={null}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe("CompareTab — comparing a range", () => {
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

describe("CompareTab — what the range did", () => {
  it("reports volume and lift changes for whatever range is set, and states why a too-short one has nothing", () => {
    setup({ workouts, scans, initialWindowB: { start: "2026-02-01", end: "2026-02-05" } });
    expect(screen.getByText("In this range")).toBeInTheDocument();
    expect(screen.getByText(/needs 9 more days in this cycle \(has 5, needs 14\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Range starts"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Range ends"), { target: { value: "2026-02-28" } });
    expect(screen.getByText(/Back Squat estimated 1RM rose 15% \(200 to 230\)/)).toBeInTheDocument();
  });
});

describe("CompareTab — saving a comparison", () => {
  it("saves the range and the earlier range as an experiment by default", () => {
    const { onAddTag } = setup();
    expect(screen.getByLabelText("Type")).toHaveValue("experiment");
    expect(screen.getByText(/compared with the earlier\s+range shown above/)).toBeInTheDocument();
    expect(screen.queryByText(/the days between these two ranges/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New program" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as period" }));
    expect(onAddTag).toHaveBeenCalledWith({
      type: "experiment",
      label: "New program",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      baselineStart: "2026-01-04",
    });
    expect(screen.getByRole("button", { name: "Saved as period" })).toBeDisabled();
  });

  it("saves under the type that was picked, from the things you changed only", () => {
    const { onAddTag } = setup();
    const select = screen.getByLabelText("Type");
    expect(Array.from(select.querySelectorAll("optgroup")).map((g) => g.getAttribute("label"))).toEqual([
      "Nutrition",
      "Programming",
      "Recovery",
      "Something else",
    ]);
    expect(Array.from(select.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "Nutrition change",
      "Cut",
      "Bulk",
      "Maintain",
      "Programming change",
      "New cycle",
      "Deload",
      "Recovery change",
      "Experiment",
      "Other",
    ]);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as period" }));
    expect(onAddTag).toHaveBeenCalledWith(expect.objectContaining({ type: "cut", label: "Comparison, Feb 1, 2026 – Feb 28, 2026" }));
  });

  it("warns that an earlier range with a gap before the range will gain the gap when saved", () => {
    const { onAddTag } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Choose the earlier range" }));
    fireEvent.change(screen.getByLabelText("Earlier range ends"), { target: { value: "2026-01-20" } });
    expect(screen.getByText(/the days between these two ranges will be included/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as period" }));
    expect(onAddTag).toHaveBeenCalledWith(expect.objectContaining({ baselineStart: "2026-01-04" }));
  });
});

describe("CompareTab — saved ranges", () => {
  const experiment: ContextTag = {
    id: "a",
    type: "experiment",
    label: "Started 5/3/1 cycle",
    startDate: "2026-02-01",
    endDate: "2026-02-28",
  };
  const cut: ContextTag = { id: "c", type: "cut", label: "Spring cut", startDate: "2026-01-05", endDate: "2026-02-20" };

  it("says so when there are none", () => {
    setup();
    expect(screen.getByText(/No saved periods yet/)).toBeInTheDocument();
  });

  it("lists tags for something you changed, not injury or travel", () => {
    const injury: ContextTag = { id: "i", type: "injury", label: "Wrist", startDate: "2026-02-01", endDate: "2026-02-10" };
    const trip: ContextTag = { id: "t", type: "travel", label: "Lisbon", startDate: "2026-02-10", endDate: "2026-02-14" };
    setup({ tags: [experiment, cut, injury, trip] });
    expect(screen.getByText("Started 5/3/1 cycle", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Spring cut", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Wrist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: 'Show "Lisbon"' })).not.toBeInTheDocument();
  });

  it("lists periods of every type in something you changed, with their own type names", () => {
    const at = (id: string, type: ContextTag["type"], label: string): ContextTag => ({ id, type, label, startDate: "2026-02-01", endDate: "2026-02-28" });
    setup({
      tags: [at("n", "nutrition", "Added creatine"), at("p", "programming", "Own programming"), at("r", "recovery", "Sleep"), at("i", "injury", "Wrist")],
    });
    expect(screen.getByText("Nutrition change · Feb 1, 2026 – Feb 28, 2026")).toBeInTheDocument();
    expect(screen.getByText("Programming change · Feb 1, 2026 – Feb 28, 2026")).toBeInTheDocument();
    expect(screen.getByText("Recovery change · Feb 1, 2026 – Feb 28, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: 'Show "Wrist"' })).not.toBeInTheDocument();
  });

  it("lists each with its type, its dates and, for an experiment once both datasets are loaded, its classification", () => {
    setup({ tags: [experiment, cut], experimentInsights: new Map([["a", insight("a", { classification: "mixed" })]]) });
    expect(screen.getByText("Experiment · Feb 1, 2026 – Feb 28, 2026")).toBeInTheDocument();
    expect(screen.getByText("Cut · Jan 5, 2026 – Feb 20, 2026")).toBeInTheDocument();
    expect(screen.getByText("Mixed")).toBeInTheDocument();
  });

  it("fills the range in from an experiment and shows its verdict, compared with all earlier history", () => {
    setup({
      tags: [experiment],
      initialWindowB: null,
      experimentInsights: new Map([["a", insight("a", { classification: "improved" })]]),
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

  it("opens straight onto a tag chosen on the Tags view", () => {
    setup({ tags: [experiment], initialWindowB: null, initialTagId: "a", experimentInsights: new Map([["a", insight("a")]]) });
    expect(screen.getByLabelText("Range starts")).toHaveValue("2026-02-01");
    expect(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Performance improved after this started/)).toBeInTheDocument();
  });

  it("uses a saved comparison's own earlier range", () => {
    const withBaseline: ContextTag = { ...experiment, id: "c2", label: "Comparison", baselineStart: "2026-01-10" };
    setup({ tags: [withBaseline], initialWindowB: null });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Comparison"' }));
    expect(screen.getByText(/Compared with Jan 10, 2026 – Jan 31, 2026/)).toBeInTheDocument();
    expect(screen.getByLabelText("Earlier range starts")).toHaveValue("2026-01-10");
  });

  it("shows the specific reason for an insufficient_data verdict, and no numbers", () => {
    setup({
      tags: [experiment],
      experimentInsights: new Map([
        [
          "a",
          insight("a", {
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

  it("shows a verdict for a period that isn't an experiment, with the cut note under a cut's", () => {
    const nutrition: ContextTag = { id: "n", type: "nutrition", label: "Added creatine", startDate: "2026-02-01", endDate: "2026-02-28" };
    const cutting: ContextTag = { ...cut, id: "k", startDate: "2026-02-01", endDate: "2026-02-28" };
    setup({
      tags: [nutrition, cutting],
      initialWindowB: null,
      experimentInsights: new Map([
        ["n", insight("n", { classification: "improved" })],
        ["k", insight("k", { classification: "declined" })],
      ]),
    });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Added creatine"' }));
    expect(screen.getByText(/Performance improved after this started/)).toBeInTheDocument();
    expect(screen.queryByText(/during a cut/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Show "Spring cut"' }));
    expect(screen.getByText("Performance declined after this started.")).toBeInTheDocument();
    expect(screen.getByText("Lifts and lean mass often move differently during a cut.")).toBeInTheDocument();
  });

  it("asks for an InBody export, and forwards a dropped file, when a verdict needs one", () => {
    const { onBodyCompFile } = setup({ tags: [experiment], experimentInsights: null, bodyComp: { status: "idle" } });
    // The list and the comparison work without InBody data; only the verdict waits on it.
    expect(screen.getByText("Started 5/3/1 cycle", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload your InBody CSV export" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    const dropzone = screen.getByRole("button", { name: "Upload your InBody CSV export" });
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onBodyCompFile).toHaveBeenCalledWith(file);
  });

  it("shows an error alert when the InBody upload failed", () => {
    setup({
      tags: [experiment],
      experimentInsights: null,
      bodyComp: { status: "error", message: "That file is missing a date column." },
    });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    expect(screen.getByText("That file didn't work")).toBeInTheDocument();
    expect(screen.getByText("That file is missing a date column.")).toBeInTheDocument();
  });

  it("drops the experiment's verdict as soon as a date is typed", () => {
    setup({ tags: [experiment], experimentInsights: new Map([["a", insight("a")]]) });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Started 5/3/1 cycle"' }));
    expect(screen.getByText(/Performance improved after this started/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Range ends"), { target: { value: "2026-02-27" } });
    expect(screen.queryByText(/Performance improved after this started/)).not.toBeInTheDocument();
  });
});

describe("CompareTab — a block's report", () => {
  const day = (n: number) => dayjs("2026-03-01").add(n, "day").format("YYYY-MM-DD");
  const blockWorkouts = [200, 205, 212, 218, 224, 230].map((v, i) => liftRow(md(day(i * 7)), "Back Squat", v));
  const blockScans = [
    scanRow(day(1), { "Weight(lb)": "190", "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "30" }),
    scanRow(day(20), { "Weight(lb)": "187", "Soft Lean Mass(lb)": "140.2", "Body Fat Mass(lb)": "27" }),
    scanRow(day(40), { "Weight(lb)": "184", "Soft Lean Mass(lb)": "140.5", "Body Fat Mass(lb)": "24" }),
  ];
  const cut: ContextTag = { id: "c", type: "cut", label: "Spring cut", startDate: day(0), endDate: day(42) };

  it("shows the focus lifts and a lift table once the block is picked", () => {
    setup({ workouts: blockWorkouts, scans: blockScans, tags: [cut], initialWindowB: null });
    fireEvent.click(screen.getByRole("button", { name: 'Show "Spring cut"' }));
    expect(screen.getByLabelText("Range starts")).toHaveValue(day(0));
    expect(screen.getByLabelText("Range ends")).toHaveValue(day(42));
    expect(screen.getByText("Spring cut", { selector: "[data-slot=card-title]" })).toBeInTheDocument();
    expect(screen.getByText(/Focus: Back Squat/)).toBeInTheDocument();
    expect(screen.getByText(/Back Squat estimated 1RM rose 15% \(200 to 230\)/)).toBeInTheDocument();
    expect(screen.getByText("Strength")).toBeInTheDocument();
  });
});
