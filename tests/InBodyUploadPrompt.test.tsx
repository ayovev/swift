import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InBodyUploadPrompt } from "@/components/dashboard/InBodyUploadPrompt";

describe("InBodyUploadPrompt", () => {
  it("shows the view's copy, the dropzone, and a privacy line that names both files", () => {
    render(
      <InBodyUploadPrompt state={{ status: "idle" }} onFile={vi.fn()}>
        Needs an InBody export.
      </InBodyUploadPrompt>
    );
    expect(screen.getByText("Needs an InBody export.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload your InBody CSV export" })).toBeInTheDocument();
    expect(screen.getByText("Your files never leave this browser.")).toBeInTheDocument();
  });

  it("forwards a dropped file", () => {
    const onFile = vi.fn();
    render(
      <InBodyUploadPrompt state={{ status: "idle" }} onFile={onFile}>
        x
      </InBodyUploadPrompt>
    );
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.drop(screen.getByRole("button", { name: "Upload your InBody CSV export" }), { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("states a failed upload plainly, and only then", () => {
    const { rerender } = render(
      <InBodyUploadPrompt state={{ status: "error", message: "That file is missing a date column." }} onFile={vi.fn()}>
        x
      </InBodyUploadPrompt>
    );
    expect(screen.getByText("That file didn't work")).toBeInTheDocument();
    expect(screen.getByText("That file is missing a date column.")).toBeInTheDocument();
    rerender(
      <InBodyUploadPrompt state={{ status: "idle" }} onFile={vi.fn()}>
        x
      </InBodyUploadPrompt>
    );
    expect(screen.queryByText("That file didn't work")).not.toBeInTheDocument();
  });

  it("renders an optional header strip above the copy", () => {
    render(
      <InBodyUploadPrompt state={{ status: "idle" }} onFile={vi.fn()} header={<span>InBody mark</span>}>
        x
      </InBodyUploadPrompt>
    );
    expect(screen.getByText("InBody mark")).toBeInTheDocument();
  });
});
