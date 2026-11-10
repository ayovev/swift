import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TimelineTab } from "@/components/dashboard/TimelineTab";
import { LiftsTab } from "@/components/dashboard/LiftsTab";
import type { TimelineEntry } from "@/types/timeline";
import { scanRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

// jsdom doesn't implement ResizeObserver; Radix's checkbox sizing needs one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

/** The Timeline on the bundled sample, as of the day the front door's cases are pinned to. */

const rows = await loadSampleRows();
const ASOF = "2026-09-11";

const abroad: TimelineEntry = { id: "a", initiation: "happened", area: "travel", name: "Two weeks abroad", startDate: "2025-06-01", endDate: "2025-06-14" };
const cut: TimelineEntry = { id: "c", initiation: "changed", area: "nutrition", name: "Spring cut", startDate: "2025-03-01", endDate: "2025-08-31", note: "Aiming for 175 lb." };
const ongoing: TimelineEntry = { id: "o", initiation: "changed", area: "training", name: "New block", startDate: "2026-06-01", endDate: null };

/** The tab with its entries held in state, as App holds them. */
function Harness({ initial = [], onAdd = vi.fn(), subject = null }: { initial?: TimelineEntry[]; onAdd?: (e: unknown) => void; subject?: string | null }) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>(initial);
  return (
    <TimelineTab
      workouts={rows}
      scans={[]}
      timeline={timeline}
      asOf={ASOF}
      initialSubjectKey={subject}
      onAddEntry={(entry) => {
        onAdd(entry);
        const id = `new-${timeline.length}`;
        setTimeline((t) => [...t, { ...entry, id }]);
        return id;
      }}
      onUpdateEntry={(entry) => setTimeline((t) => t.map((e) => (e.id === entry.id ? entry : e)))}
      onDeleteEntry={(id) => setTimeline((t) => t.filter((e) => e.id !== id))}
    />
  );
}

const selected = (): HTMLElement => screen.getByRole("region", { name: "Selected" });

describe("the Timeline view (A1-TLN-18 to 31)", () => {
  it("TLN-18 draws entries above verdict lanes, in the front door's order, with none for Fewer than 6 sessions or Not recent", () => {
    render(<Harness initial={[cut]} />);
    const lanes = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-lane"));
    // 8 up (6 verdicts and 2 move-ups), 1 down, 5 no clear change: 14 lanes.
    expect(lanes).toHaveLength(14);
    expect(within(lanes[0]!).getByText(/Up/)).toBeInTheDocument();
    expect(screen.queryByText("Outside this range")).not.toBeInTheDocument();
  });

  it("TLN-19 shows each entry as a bar named in the athlete's words, with the kind in its label", () => {
    render(<Harness initial={[cut, abroad]} />);
    expect(screen.getByRole("button", { name: "Spring cut, something I changed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Two weeks abroad, something that happened" })).toBeInTheDocument();
  });

  it("TLN-20 marks an ongoing entry in its label and with an arrow", () => {
    render(<Harness initial={[ongoing]} />);
    expect(screen.getByRole("button", { name: "New block, something I changed, ongoing" })).toBeInTheDocument();
    expect(screen.getByText(/New block →/)).toBeInTheDocument();
  });

  it("TLN-21 opens an entry's detail in the one Selected panel, and shows a hint when nothing is selected", () => {
    render(<Harness initial={[cut]} />);
    expect(within(selected()).getByText("Select an entry or a subject on the chart, or add to the timeline.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Spring cut/ }));
    expect(within(selected()).getByRole("heading", { name: "Spring cut" })).toBeInTheDocument();
    expect(within(selected()).getByText("Something I changed · Nutrition")).toBeInTheDocument();
    expect(within(selected()).getByText("Mar 1, 2025 to Aug 31, 2025")).toBeInTheDocument();
    expect(within(selected()).getByText("Aiming for 175 lb.")).toBeInTheDocument();
  });

  it("TLN-22 gives something that happened no before and after, but its overlaps", () => {
    render(<Harness initial={[cut, abroad]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Two weeks abroad/ }));
    expect(within(selected()).getByText(/None\. Something that happened is shown beside your results for context/)).toBeInTheDocument();
    expect(within(selected()).queryByText(/Before and after/)).not.toBeInTheDocument();
    expect(within(selected()).getByText("Overlaps: Spring cut")).toBeInTheDocument();
  });

  it("TLN-23 gives something the athlete changed a before and after, or says what is short", () => {
    render(<Harness initial={[cut]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Spring cut/ }));
    const panel = selected();
    expect(within(panel).getByRole("region", { name: "Before and after" })).toBeInTheDocument();
    const summary = within(panel).queryByText(/lifts and benchmarks \(|lifts and benchmarks\./);
    const shortfall = within(panel).queryByText("No before and after yet");
    expect(Boolean(summary) !== Boolean(shortfall)).toBe(true);
  });

  it("TLN-24 opens a subject from its lane and shows its sessions on the timeline's axis", () => {
    render(<Harness />);
    const lane = screen.getAllByRole("listitem").find((li) => li.getAttribute("data-lane")?.startsWith("power snatch")) as HTMLElement;
    fireEvent.click(within(lane).getByRole("button"));
    expect(within(selected()).getByRole("heading", { name: "Power Snatch" })).toBeInTheDocument();
    expect(within(selected()).getByRole("img", { name: "Sessions of Power Snatch, as estimated one-rep maxes" })).toBeInTheDocument();
  });

  it("TLN-25 gives a move up to RX a lane that does not open", () => {
    render(<Harness />);
    const lane = screen.getAllByRole("listitem").find((li) => li.getAttribute("data-lane")?.startsWith("fran")) as HTMLElement;
    expect(within(lane).getByText("Moved up to RX")).toBeInTheDocument();
    expect(within(lane).queryByRole("button")).not.toBeInTheDocument();
  });

  it("TLN-26 opens on a subject when the front door's link sends it there", () => {
    render(<Harness subject="power snatch|RX" />);
    expect(within(selected()).getByRole("heading", { name: "Power Snatch" })).toBeInTheDocument();
  });

  it("TLN-27 narrows the range, clipping entries and calling a subject wholly outside it so", () => {
    render(<Harness initial={[cut]} />);
    fireEvent.click(screen.getByRole("button", { name: "Last 6 months" }));
    expect(screen.queryByRole("button", { name: /^Spring cut/ })).not.toBeInTheDocument();
    expect(screen.getByText("No entries in this range.")).toBeInTheDocument();
    expect(screen.getAllByText("Outside this range").length).toBeGreaterThan(0);
  });
});

describe("adding, editing and deleting (A1-TLN-28 to 30)", () => {
  it("TLN-28 opens the form from Add to timeline with nothing chosen, and lists every failing rule", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add to timeline" }));
    const dialog = screen.getByRole("dialog", { name: "Add to timeline" });
    expect(within(dialog).getByRole("radio", { name: /Something I changed/ })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Ongoing" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    const alert = within(dialog).getByRole("alert");
    expect(within(alert).getByText("Choose whether you changed it or it happened.")).toBeInTheDocument();
    expect(within(alert).getByText("Choose what it touches.")).toBeInTheDocument();
    expect(within(alert).getByText("Add a start date.")).toBeInTheDocument();
  });

  it("TLN-29 saves a valid entry, closes the form and selects the entry", async () => {
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    const area = screen.getByTestId("entries-area");
    area.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, right: 1000, bottom: 36, height: 36, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(area, { clientX: 500 });
    const dialog = screen.getByRole("dialog", { name: "Add to timeline" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Something that happened/ }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Health" }));
    fireEvent.change(within(dialog).getByLabelText("Name (optional)"), { target: { value: "Shoulder tweak" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ initiation: "happened", area: "health", name: "Shoulder tweak", endDate: null }));
    expect(within(selected()).getByRole("heading", { name: "Shoulder tweak" })).toBeInTheDocument();
  });

  it("Cancel closes the form without saving", async () => {
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to timeline" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("TLN-30 prefills the start date from a click on an empty spot of the entries area, never replacing the button", () => {
    render(<Harness />);
    const area = screen.getByTestId("entries-area");
    area.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, right: 1000, bottom: 36, height: 36, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(area, { clientX: 1000 });
    const dialog = screen.getByRole("dialog", { name: "Add to timeline" });
    // The start date is filled in; nothing else is.
    expect(dialog.querySelector("#entry-start")).toHaveTextContent(/2026/);
    expect(within(dialog).getByRole("radio", { name: /Something I changed/ })).not.toBeChecked();
  });

  it("edits an entry in the same dialog, prefilled", () => {
    render(<Harness initial={[cut]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Spring cut/ }));
    fireEvent.click(within(selected()).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit entry" });
    expect(within(dialog).getByLabelText("Name (optional)")).toHaveValue("Spring cut");
    expect(within(dialog).getByRole("radio", { name: /Something I changed/ })).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText("Name (optional)"), { target: { value: "Spring cut, v2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(selected()).getByRole("heading", { name: "Spring cut, v2" })).toBeInTheDocument();
  });

  it("asks before deleting, naming the entry and saying the workouts are not affected; Cancel keeps it", async () => {
    render(<Harness initial={[cut]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Spring cut/ }));
    fireEvent.click(within(selected()).getByRole("button", { name: "Delete" }));
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).getByText(/"Spring cut" will be removed from the timeline\. Your workouts are not affected\./)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Spring cut/ })).toBeInTheDocument();

    fireEvent.click(within(selected()).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Spring cut/ })).not.toBeInTheDocument());
    expect(within(selected()).getByText(/Select an entry or a subject/)).toBeInTheDocument();
  });

  it("states body weight once in an entry's detail when there are readings", () => {
    render(
      <TimelineTab
        workouts={rows}
        scans={[scanRow("2025-03-01", { "Weight(lb)": "190" }), scanRow("2025-08-31", { "Weight(lb)": "184" })]}
        timeline={[cut]}
        asOf={ASOF}
        onAddEntry={() => "x"}
        onUpdateEntry={() => undefined}
        onDeleteEntry={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Spring cut/ }));
    expect(within(selected()).getByText("Body weight over this entry: 190 lb to 184 lb, down 6 lb.")).toBeInTheDocument();
  });
});

describe("the front door's link (A1-TLN-18 on the Progress side)", () => {
  it("offers See on timeline under an opened row's chart for a subject with a lane, and sends its key", () => {
    const onSee = vi.fn();
    render(<LiftsTab workouts={rows} scans={[]} asOf={ASOF} onSeeOnTimeline={onSee} />);
    const row = screen.getByText("Power Snatch").closest("li") as HTMLElement;
    expect(within(row).queryByText("See on timeline")).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button"));
    fireEvent.click(within(row).getByText("See on timeline"));
    expect(onSee).toHaveBeenCalledWith("power snatch|RX");
  });

  it("offers no link without a handler, and none on a facts-line row", () => {
    render(<LiftsTab workouts={rows} scans={[]} asOf={ASOF} />);
    const row = screen.getByText("Power Snatch").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    expect(within(row).queryByText("See on timeline")).not.toBeInTheDocument();
  });
});
