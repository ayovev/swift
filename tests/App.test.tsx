import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "@/App";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { loadBodyCompRows, saveBodyCompRows } from "@/lib/storage/bodyCompStorage";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadWorkoutRows, saveWorkoutRows } from "@/lib/storage/workoutStorage";
import type { SugarWodRow } from "@/types/sugarwod";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";
import { loadSampleCsvText, loadSampleRows } from "./fixtures/sampleRows";

function workoutRow(date: string): SugarWodRow {
  return {
    date,
    title: "GRACE",
    description: "30 clean and jerks for time Rx (95/135 lb)",
    best_result_raw: "180",
    best_result_display: "3:00",
    score_type: "",
    barbell_lift: "",
    set_details: "",
    notes: "",
    rx_or_scaled: "RX",
    pr: "",
  };
}

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

afterEach(async () => {
  await idbClearAll();
});

describe("App — local persistence", () => {
  it("shows the upload screen when nothing is stored", async () => {
    renderApp();
    await screen.findByRole("button", { name: /upload your sugarwod csv export/i });
  });

  it("restores persisted workout and body comp rows on mount, skipping straight to the dashboard", async () => {
    const rows = (await loadSampleRows()).slice(0, 5);
    const bodyRows = await loadSampleInBodyRows();
    await saveWorkoutRows(rows);
    await saveBodyCompRows(bodyRows);

    renderApp();

    await screen.findByRole("button", { name: /start over/i });
  });

  it("persists an uploaded file so a fresh mount restores it without re-uploading", async () => {
    const { container, unmount } = renderApp();
    await screen.findByRole("button", { name: /upload your sugarwod csv export/i });

    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("expected the upload dropzone to render a file input");
    const file = new File([loadSampleCsvText()], "export.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    // The loading state is floored to MIN_LOADING_MS (see App.tsx) so the
    // loading bar is actually visible, which pushes this past the default
    // findByRole timeout.
    await screen.findByRole("button", { name: /start over/i }, { timeout: 3000 });
    await waitFor(async () => {
      expect(await loadWorkoutRows()).toHaveLength(1209);
    });

    unmount();
    renderApp();

    // The second mount restores from storage rather than showing the upload
    // screen — no re-upload needed for data that's already there.
    await screen.findByRole("button", { name: /start over/i });
  });

  it("chalks in a workout/PR summary right after upload, then hands off to the dashboard", async () => {
    const { container } = renderApp();
    await screen.findByRole("button", { name: /upload your sugarwod csv export/i });

    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("expected the upload dropzone to render a file input");
    const file = new File([loadSampleCsvText()], "export.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    // Numbers count up, so match the shape rather than a settled value —
    // this is a beat, not a stop, and it hands off to the dashboard next.
    await screen.findByText(/[\d,]+ workouts logged · [\d,]+ personal records/i, undefined, {
      timeout: 3000,
    });
    await screen.findByRole("button", { name: /start over/i }, { timeout: 3000 });
  });

  it("'Start over' clears persisted data, not just the in-memory view", async () => {
    const rows = (await loadSampleRows()).slice(0, 5);
    const bodyRows = await loadSampleInBodyRows();
    await saveWorkoutRows(rows);
    await saveBodyCompRows(bodyRows);

    renderApp();
    const startOver = await screen.findByRole("button", { name: /start over/i });
    fireEvent.click(startOver);

    await waitFor(async () => {
      expect(await loadWorkoutRows()).toBeUndefined();
      expect(await loadBodyCompRows()).toBeUndefined();
    });
  });
});

describe("App — daily granularity gating", () => {
  // Two entries, a bit over two years apart — enough to make "All time"
  // outgrow MAX_DAILY_SPAN_DAYS without needing the real (and expensive to
  // parse) sample export.
  const rows = [workoutRow("01/01/2022"), workoutRow("06/01/2024")];

  it("disables Daily at a multi-year all-time range, and enables it once the range narrows", async () => {
    await saveWorkoutRows(rows);
    renderApp();
    await screen.findByRole("button", { name: /start over/i });

    expect(await screen.findByRole("button", { name: "Daily" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /all time/i }));
    fireEvent.click(await screen.findByRole("button", { name: /last month/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Daily" })).not.toBeDisabled();
    });
  });

  it("falls back to Weekly when the range widens back out from under an active Daily view", async () => {
    await saveWorkoutRows(rows);
    renderApp();
    await screen.findByRole("button", { name: /start over/i });

    // Narrow first so Daily is selectable, then select it.
    fireEvent.click(screen.getByRole("button", { name: /all time/i }));
    fireEvent.click(await screen.findByRole("button", { name: /last month/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Daily" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
    });

    // Widen back out to all time.
    fireEvent.click(screen.getByRole("button", { name: /last month/i }));
    fireEvent.click(await screen.findByRole("button", { name: /all time/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Weekly" })).toHaveAttribute("aria-pressed", "true");
    });
  });
});
