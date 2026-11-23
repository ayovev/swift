import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModalityTab } from "@/components/dashboard/ModalityTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("ModalityTab", () => {
  it("leaves unclassified workouts out of its shares without printing a note about them", async () => {
    const { modality } = buildInsights(await loadSampleRows(), null, "monthly");
    // The sample has workouts with no recognized movement: they are still counted as left out in the data (and said so in the page footer)...
    expect(modality.unclassified_count).toBeGreaterThan(0);
    render(<ModalityTab modality="M" data={modality} granularity="monthly" />);
    // ...but the modality page does not repeat it beside the share.
    expect(screen.queryByText(/no recognized movement/)).toBeNull();
    expect(screen.queryByText(/left out/)).toBeNull();
  });
});
