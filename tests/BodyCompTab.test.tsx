import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BodyCompTab } from "@/components/dashboard/BodyCompTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("BodyCompTab — empty state", () => {
  it("shows the upload dropzone when no InBody data is loaded", async () => {
    const rows = await loadSampleRows();
    const dashboard = buildInsights(rows, null, "monthly").dashboard;
    const onFile = vi.fn();

    render(<BodyCompTab state={{ status: "idle" }} granularity="monthly" onFile={onFile} dashboard={dashboard} />);

    expect(screen.getByRole("button", { name: "Upload your InBody CSV export" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /replace file/i })).not.toBeInTheDocument();
  });
});

describe("BodyCompTab — ready state", () => {
  it("offers a 'Replace file' control that forwards a newly picked file", async () => {
    const rows = await loadSampleRows();
    const dashboard = buildInsights(rows, null, "monthly").dashboard;
    const bodyRows = await loadSampleInBodyRows();
    const onFile = vi.fn();

    const { container } = render(
      <BodyCompTab
        state={{ status: "ready", rows: bodyRows }}
        granularity="monthly"
        onFile={onFile}
        dashboard={dashboard}
      />
    );

    expect(screen.getByRole("button", { name: /replace file/i })).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("expected the replace-file control to render a file input");
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });
});
