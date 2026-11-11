import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModalityTab } from "@/components/dashboard/ModalityTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("ModalityTab", () => {
  it("states how many workouts its shares leave out, beside the share", async () => {
    const { modality } = buildInsights(await loadSampleRows(), null, "monthly");
    expect(modality.unclassified_count).toBeGreaterThan(0);
    render(<ModalityTab modality="M" data={modality} granularity="monthly" />);
    expect(
      screen.getByText(`${modality.unclassified_count.toLocaleString()} workouts with no recognised movement are left out.`)
    ).toBeInTheDocument();
  });
});
