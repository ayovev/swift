import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeriodsTab } from "@/components/dashboard/PeriodsTab";
import type { ExperimentInsight } from "@/types/experiment";
import type { ContextTag } from "@/types/tag";

const tag: ContextTag = { id: "a", type: "cut", label: "Spring cut", startDate: "2026-03-01", endDate: null };

function setup(over: Partial<React.ComponentProps<typeof PeriodsTab>> = {}) {
  const props = {
    tags: [] as ContextTag[],
    source: "upload" as const,
    experimentInsights: null,
    onCompareTag: vi.fn(),
    initialWindow: null,
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
  render(<PeriodsTab {...props} />);
  return props;
}

describe("PeriodsTab", () => {
  it("says plainly that periods live only in this browser", () => {
    setup();
    expect(screen.getByText(/Periods are stored in this browser only/)).toBeInTheDocument();
    expect(screen.getByText("No periods yet.")).toBeInTheDocument();
  });

  it("adds a dated tag; an open-ended one has a null end date", () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "injury" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-05-01" } });
    expect(screen.getByRole("button", { name: "Add period" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Still going"));
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Wrist" } });
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    expect(p.onAdd).toHaveBeenCalledWith({ type: "injury", label: "Wrist", startDate: "2026-05-01", endDate: null });
  });

  it("will not add a tag that ends before it starts", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-05-10" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-05-01" } });
    expect(screen.getByRole("button", { name: "Add period" })).toBeDisabled();
  });

  it("pre-fills the range dragged on a chart", () => {
    setup({ initialWindow: { start: "2026-02-01", end: "2026-03-31" } });
    expect(screen.getByLabelText("Starts")).toHaveValue("2026-02-01");
    expect(screen.getByLabelText("Ends")).toHaveValue("2026-03-31");
  });

  it("edits and deletes an existing tag", () => {
    const p = setup({ tags: [tag] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Spring cut" }));
    expect(screen.getByLabelText("Still going")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Winter cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(p.onUpdate).toHaveBeenCalledWith({ id: "a", type: "cut", label: "Winter cut", startDate: "2026-03-01", endDate: null });
    fireEvent.click(screen.getByRole("button", { name: "Delete Spring cut" }));
    expect(p.onDelete).toHaveBeenCalledWith("a");
  });

  it("offers no export or import of its own: backup in Settings covers periods", () => {
    setup({ tags: [tag] });
    expect(screen.queryByRole("button", { name: /export periods/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import periods/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/import periods from a json file/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Download a backup from Settings to keep a copy/)).toBeInTheDocument();
  });

  it("warns that tags added over sample data are not stored", () => {
    setup({ source: "sample" });
    expect(screen.getByText(/Periods added while sample data is showing are not stored/)).toBeInTheDocument();
  });

  it("groups the type picker into what you changed and what happened", () => {
    setup();
    const select = screen.getByLabelText("Type");
    const groups = Array.from(select.querySelectorAll("optgroup")).map((g) => [
      g.getAttribute("label"),
      Array.from(g.querySelectorAll("option")).map((o) => o.textContent),
    ]);
    expect(groups).toEqual([
      ["Something you changed", ["Experiment", "Cut", "Bulk", "Maintain", "Other"]],
      ["Something that happened", ["Injury", "Travel"]],
    ]);
    expect(select).toHaveValue("experiment");
  });

  describe("experiments", () => {
    const experiment: ContextTag = {
      id: "x",
      type: "experiment",
      label: "Started 5/3/1",
      startDate: "2026-04-01",
      endDate: null,
      baselineStart: "2026-03-01",
    };
    const insight = (classification: ExperimentInsight["classification"]): ExperimentInsight => ({
      experiment: { id: "x", date: "2026-04-01", label: "Started 5/3/1" },
      classification,
      performanceSummary: { improvingCount: 2, decliningCount: 0, flatCount: 1, classifiedCount: 3 },
      bodyCompSummary: { leanMassDelta: 1, fatMassDelta: -1, bodyFatPctDelta: -0.4 },
    });

    it("offers a compare-against date for an experiment only", () => {
      setup();
      expect(screen.getByLabelText("Compare against (optional)")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Type"), { target: { value: "injury" } });
      expect(screen.queryByLabelText("Compare against (optional)")).not.toBeInTheDocument();
    });

    it("adds an experiment with its earlier-range start", () => {
      const p = setup();
      fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-04-01" } });
      fireEvent.click(screen.getByLabelText("Still going"));
      fireEvent.change(screen.getByLabelText("Compare against (optional)"), { target: { value: "2026-03-01" } });
      fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Started 5/3/1" } });
      fireEvent.click(screen.getByRole("button", { name: "Add period" }));
      expect(p.onAdd).toHaveBeenCalledWith({
        type: "experiment",
        label: "Started 5/3/1",
        startDate: "2026-04-01",
        endDate: null,
        baselineStart: "2026-03-01",
      });
    });

    it("will not save an earlier range that doesn't start before the experiment", () => {
      setup();
      fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-04-01" } });
      fireEvent.click(screen.getByLabelText("Still going"));
      fireEvent.change(screen.getByLabelText("Compare against (optional)"), { target: { value: "2026-04-01" } });
      expect(screen.getByRole("button", { name: "Add period" })).toBeDisabled();
      expect(screen.getByText(/has to be before the experiment starts/)).toBeInTheDocument();
    });

    it("keeps the earlier-range start through an edit", () => {
      const p = setup({ tags: [experiment] });
      fireEvent.click(screen.getByRole("button", { name: "Edit Started 5/3/1" }));
      expect(screen.getByLabelText("Compare against (optional)")).toHaveValue("2026-03-01");
      fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Renamed" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(p.onUpdate).toHaveBeenCalledWith({ ...experiment, label: "Renamed" });
    });

    it("says what an experiment is compared with", () => {
      setup({ tags: [experiment, { ...experiment, id: "y", label: "Other", baselineStart: undefined as never }] });
      expect(screen.getByText("Compared with Mar 1, 2026 – Mar 31, 2026")).toBeInTheDocument();
      expect(screen.getByText("Compared with all history before Apr 1, 2026")).toBeInTheDocument();
    });

    it("shows the verdict on its row once both uploads are loaded, and not before", () => {
      const { rerender } = render(
        <PeriodsTab
          tags={[experiment]}
          source="upload"
          experimentInsights={null}
          onCompareTag={vi.fn()}
          initialWindow={null}
          onAdd={vi.fn()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.queryByText("Improved")).not.toBeInTheDocument();
      rerender(
        <PeriodsTab
          tags={[experiment]}
          source="upload"
          experimentInsights={new Map([["x", insight("improved")]])}
          onCompareTag={vi.fn()}
          initialWindow={null}
          onAdd={vi.fn()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByText("Improved")).toBeInTheDocument();
    });

    it("gives no verdict to a tag that isn't an experiment", () => {
      setup({ tags: [tag], experimentInsights: new Map([["a", insight("improved")]]) });
      expect(screen.queryByText("Improved")).not.toBeInTheDocument();
    });
  });

  describe("opening a tag on Compare", () => {
    it("is offered for something you changed, and calls back with the tag's id", () => {
      const p = setup({ tags: [tag] });
      fireEvent.click(screen.getByRole("button", { name: "Compare Spring cut" }));
      expect(p.onCompareTag).toHaveBeenCalledWith("a");
    });

    it("is not offered for something that happened", () => {
      setup({ tags: [{ id: "i", type: "injury", label: "Wrist", startDate: "2026-05-01", endDate: "2026-05-20" }] });
      expect(screen.queryByRole("button", { name: "Compare Wrist" })).not.toBeInTheDocument();
    });
  });
});
