import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagsTab } from "@/components/dashboard/TagsTab";
import { serializeTags } from "@/lib/analytics/contextTags";
import type { ContextTag } from "@/types/tag";

const tag: ContextTag = { id: "a", type: "cut", label: "Spring cut", startDate: "2026-03-01", endDate: null };

function setup(over: Partial<React.ComponentProps<typeof TagsTab>> = {}) {
  const props = {
    tags: [] as ContextTag[],
    source: "upload" as const,
    initialWindow: null,
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onReplace: vi.fn(),
    ...over,
  };
  render(<TagsTab {...props} />);
  return props;
}

describe("TagsTab", () => {
  it("says plainly that tags live only in this browser", () => {
    setup();
    expect(screen.getByText(/Tags are stored in this browser only/)).toBeInTheDocument();
    expect(screen.getByText("No tags yet.")).toBeInTheDocument();
  });

  it("adds a dated tag; an open-ended one has a null end date", () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "injury" } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-05-01" } });
    expect(screen.getByRole("button", { name: "Add tag" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Still going"));
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Wrist" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(p.onAdd).toHaveBeenCalledWith({ type: "injury", label: "Wrist", startDate: "2026-05-01", endDate: null });
  });

  it("will not add a tag that ends before it starts", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-05-10" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-05-01" } });
    expect(screen.getByRole("button", { name: "Add tag" })).toBeDisabled();
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

  it("imports a tags file, merging by id, and reports what happened", async () => {
    const p = setup({ tags: [tag] });
    const incoming: ContextTag = { id: "b", type: "travel", startDate: "2026-06-01", endDate: "2026-06-05" };
    const file = new File([serializeTags([incoming])], "tags.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import tags from a JSON file"), { target: { files: [file] } });
    await waitFor(() => expect(p.onReplace).toHaveBeenCalledWith([tag, incoming]));
    expect(await screen.findByRole("status")).toHaveTextContent("Imported 1 tag.");
  });

  it("rejects a bad file without importing anything", async () => {
    const p = setup();
    const file = new File(["{"], "tags.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import tags from a JSON file"), { target: { files: [file] } });
    expect(await screen.findByRole("status")).toHaveTextContent("Nothing was imported. That file isn't valid JSON.");
    expect(p.onReplace).not.toHaveBeenCalled();
  });

  it("warns that tags added over sample data are not stored", () => {
    setup({ source: "sample" });
    expect(screen.getByText(/Tags added while sample data is showing are not stored/)).toBeInTheDocument();
  });
});
