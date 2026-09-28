import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { loadBodyCompRows, saveBodyCompRows } from "@/lib/storage/bodyCompStorage";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadViewPreferences, saveViewPreferences } from "@/lib/storage/viewPreferencesStorage";
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

/** The dashboard's header always has exactly one Settings button once it's rendered. */
function findDashboard(timeout?: number) {
  return screen.findByRole("button", { name: "Settings" }, timeout ? { timeout } : undefined);
}

/** Start over, the file pickers and sync live in the Settings sheet (SettingsSheet.tsx). */
async function openSettings() {
  fireEvent.click(await findDashboard());
  return screen.findByRole("dialog", { name: "Settings" });
}

/** The grouping control is a Radix dropdown in ScopeLine, which opens on pointerdown, not click. */
async function chooseGrouping(name: RegExp) {
  fireEvent.pointerDown(screen.getByRole("button", { name: /^Grouped by/ }), { button: 0 });
  const item = await screen.findByRole("menuitemradio", { name });
  fireEvent.click(item);
}

async function openGroupingMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /^Grouped by/ }), { button: 0 });
  return screen.findByRole("menu");
}

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

    await findDashboard();
  });

  // Parses and renders the real 1,209-row sample export twice over (once on
  // upload, once again from storage after remount), on top of the two
  // MIN_LOADING_MS/REVEAL_HOLD_MS floors — comfortably over vitest's default
  // 5000ms test timeout on a loaded CI runner even though nothing is hung,
  // hence the explicit budget below rather than the suite default.
  it(
    "persists an uploaded file so a fresh mount restores it without re-uploading",
    async () => {
      const { container, unmount } = renderApp();
      await screen.findByRole("button", { name: /upload your sugarwod csv export/i });

      const input = container.querySelector('input[type="file"]');
      if (!input) throw new Error("expected the upload dropzone to render a file input");
      const file = new File([loadSampleCsvText()], "export.csv", { type: "text/csv" });
      fireEvent.change(input, { target: { files: [file] } });

      // The loading state is floored to MIN_LOADING_MS (see App.tsx) so the
      // loading bar is actually visible, which pushes this past the default
      // findByRole timeout.
      await findDashboard(3000);
      await waitFor(
        async () => {
          expect(await loadWorkoutRows()).toHaveLength(1209);
        },
        { timeout: 3000 }
      );

      unmount();
      renderApp();

      // The second mount restores from storage rather than showing the upload
      // screen — no re-upload needed for data that's already there.
      await findDashboard(3000);
    },
    15000
  );

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
    await findDashboard(3000);
  });

  it("'Start over' clears persisted data, not just the in-memory view", async () => {
    const rows = (await loadSampleRows()).slice(0, 5);
    const bodyRows = await loadSampleInBodyRows();
    await saveWorkoutRows(rows);
    await saveBodyCompRows(bodyRows);
    await saveViewPreferences({
      granularity: "weekly",
      rangePreset: "last_3_months",
      customRange: null,
    });

    renderApp();
    await openSettings();
    const startOver = await screen.findByRole("button", { name: /start over/i });
    fireEvent.click(startOver);
    const confirmReset = await screen.findByRole("button", { name: /^reset$/i });
    fireEvent.click(confirmReset);

    await waitFor(async () => {
      expect(await loadWorkoutRows()).toBeUndefined();
      expect(await loadBodyCompRows()).toBeUndefined();
      expect(await loadViewPreferences()).toBeUndefined();
    });
  });

  it("'Start over' on real uploaded data requires confirming a destructive dialog first", async () => {
    const rows = (await loadSampleRows()).slice(0, 5);
    await saveWorkoutRows(rows);

    renderApp();
    await openSettings();
    const startOver = await screen.findByRole("button", { name: /start over/i });
    fireEvent.click(startOver);

    await screen.findByText(/this can't be undone/i);
    expect(await loadWorkoutRows()).toEqual(rows);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText(/this can't be undone/i)).not.toBeInTheDocument();
    });
    expect(await loadWorkoutRows()).toEqual(rows);
  });

  // Loads and parses the full sample export, then waits out the reveal's
  // MIN_LOADING_MS/REVEAL_HOLD_MS floors before Settings is reachable — the
  // same work as the upload tests above, so the same explicit budget rather
  // than vitest's 5000ms default (CI measured it at 5.8s).
  it(
    "'Start over' on sample data resets immediately, with no confirmation dialog",
    async () => {
      const csvText = loadSampleCsvText();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, text: async () => csvText }))
      );

      try {
        renderApp();
        const sampleButton = await screen.findByRole("button", { name: /sample data/i });
        // The button is disabled while App's own mount-restore effect is still
        // resolving (loading={state.status === "loading"}) — wait for it to be
        // enabled, not just present, or a click here silently no-ops on the
        // still-disabled native button.
        await waitFor(() => expect(sampleButton).toBeEnabled());
        fireEvent.click(sampleButton);
        await findDashboard(3000);

        // Sample mode is announced once, by the full-width strip above the
        // header — not by a chip in the header or notes elsewhere on the page.
        const strips = screen.getAllByRole("status").filter((el) => /^Sample data\./.test(el.textContent ?? ""));
        expect(strips).toHaveLength(1);
        expect(screen.queryByText(/sample data isn't stored/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/stored in this browser only/i)).not.toBeInTheDocument();

        await openSettings();

        const startOver = screen.getByRole("button", { name: /start over/i });
        fireEvent.click(startOver);

        expect(screen.queryByText(/this can't be undone/i)).not.toBeInTheDocument();
        await waitFor(() => {
          expect(screen.getByRole("button", { name: /sample data/i })).toBeInTheDocument();
        });
      } finally {
        vi.unstubAllGlobals();
      }
    },
    15000
  );

  // Parses the real 1,209-row export and waits out the upload's
  // MIN_LOADING_MS/REVEAL_HOLD_MS floors — about 4s alone, so it gets the
  // same explicit budget as the persistence test above rather than the
  // suite's 5000ms default, which a loaded runner can tip it over.
  it(
    "Settings' 'Replace file' for the workout log replaces it without touching persisted preferences",
    async () => {
      const rows = (await loadSampleRows()).slice(0, 5);
      await saveWorkoutRows(rows);

      renderApp();
      await openSettings();
      const replace = screen.getByRole("button", { name: "Replace workout log" });
      // FilePickerButton renders its hidden input as the button's next sibling.
      const input = replace.nextElementSibling;
      if (!(input instanceof HTMLInputElement)) throw new Error("expected the replace control to render a file input");

      const file = new File([loadSampleCsvText()], "export.csv", { type: "text/csv" });
      fireEvent.change(input, { target: { files: [file] } });

      await screen.findByText(/[\d,]+ workouts logged · [\d,]+ personal records/i, undefined, {
        timeout: 3000,
      });
      await findDashboard(3000);

      const stored = await loadWorkoutRows();
      expect(stored?.length).toBeGreaterThan(rows.length);
    },
    15000
  );

  it("restores the selected granularity and date-range preset on a fresh mount", async () => {
    const rows = (await loadSampleRows()).slice(0, 5);
    await saveWorkoutRows(rows);
    await saveViewPreferences({
      granularity: "weekly",
      rangePreset: "last_3_months",
      customRange: null,
    });

    renderApp();
    await findDashboard();

    expect(screen.getByRole("button", { name: "Grouped by week" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /last 3 months/i })).toBeInTheDocument();
  });

  it("persists granularity and date-range changes made in the UI across a remount", async () => {
    // Two entries a couple of years apart, as in the daily-gating tests below —
    // "Last month" narrows the effective range enough for Daily to be selectable.
    const rows = [workoutRow("01/01/2022"), workoutRow("06/01/2024")];
    await saveWorkoutRows(rows);

    const { unmount } = renderApp();
    await findDashboard();

    fireEvent.click(screen.getByRole("button", { name: /all time/i }));
    fireEvent.click(await screen.findByRole("button", { name: /last month/i }));
    await chooseGrouping(/^Daily/);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grouped by day" })).toBeInTheDocument();
    });

    unmount();
    renderApp();

    await findDashboard();
    expect(await screen.findByRole("button", { name: /last month/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grouped by day" })).toBeInTheDocument();
  });
});

describe("App — view scope", () => {
  it("shows the date range and grouping on range-driven views, and says so where they don't apply", async () => {
    await saveWorkoutRows((await loadSampleRows()).slice(0, 5));
    renderApp();
    await findDashboard();

    expect(screen.getByRole("button", { name: /^all time/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grouped by month" })).toBeInTheDocument();

    // A domain page carries CrossFit's definition of the skill under its heading.
    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Cardiovascular/Respiratory Endurance" });
    expect(heading.nextElementSibling).toHaveTextContent(
      "The ability of the body’s systems to gather, process, and deliver oxygen."
    );

    // Plateaus, Alignment and Experiments are computed from the full
    // history as of today (App.tsx), never the selected range.
    fireEvent.click(screen.getByRole("button", { name: "Insights" }));
    expect(await screen.findByText(/uses your full history, as of today/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Grouped by/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^all time/i })).not.toBeInTheDocument();
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
    await findDashboard();

    const menu = await openGroupingMenu();
    expect(within(menu).getByRole("menuitemradio", { name: /^Daily/ })).toHaveAttribute("aria-disabled", "true");
    // The reason is shown in the menu itself, not left for a hover tooltip.
    expect(within(menu).getByRole("menuitemradio", { name: /^Daily/ })).toHaveTextContent(/ranges under 1 year/i);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /all time/i }));
    fireEvent.click(await screen.findByRole("button", { name: /last month/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /last month/i })).toBeInTheDocument());
    const narrowed = await openGroupingMenu();
    expect(within(narrowed).getByRole("menuitemradio", { name: /^Daily/ })).not.toHaveAttribute("aria-disabled");
  });

  it("falls back to Weekly when the range widens back out from under an active Daily view", async () => {
    await saveWorkoutRows(rows);
    renderApp();
    await findDashboard();

    // Narrow first so Daily is selectable, then select it.
    fireEvent.click(screen.getByRole("button", { name: /all time/i }));
    fireEvent.click(await screen.findByRole("button", { name: /last month/i }));
    await chooseGrouping(/^Daily/);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grouped by day" })).toBeInTheDocument();
    });

    // Widen back out to all time.
    fireEvent.click(screen.getByRole("button", { name: /last month/i }));
    fireEvent.click(await screen.findByRole("button", { name: /all time/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grouped by week" })).toBeInTheDocument();
    });
  });
});
