import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainTab } from "@/components/dashboard/DomainTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import {
  CROSSFIT_DEFINITIONS,
  CROSSFIT_DEFINITIONS_SOURCE,
  DOMAIN_BLURBS,
  DOMAIN_LIST,
} from "@/types/dashboard";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("CROSSFIT_DEFINITIONS", () => {
  it("quotes a definition for every domain, each in CrossFit's 'The ability…' form", () => {
    for (const domain of DOMAIN_LIST) {
      expect(CROSSFIT_DEFINITIONS[domain]).toMatch(/^The ability .+\.$/);
    }
  });

  it("keeps the app's own blurbs from restating the quoted definition", () => {
    for (const domain of DOMAIN_LIST) {
      expect(DOMAIN_BLURBS[domain]).not.toMatch(/^The ability/);
    }
  });
});

describe("DomainTab", () => {
  it("shows CrossFit's definition as an attributed quote linking to the source", async () => {
    const insights = buildInsights(await loadSampleRows(), null, "monthly");
    render(<DomainTab domain="Balance" data={insights.dashboard} granularity="monthly" />);

    const quote = screen.getByText(`“${CROSSFIT_DEFINITIONS.Balance}”`);
    expect(quote.tagName).toBe("BLOCKQUOTE");

    const source = screen.getByRole("link", { name: CROSSFIT_DEFINITIONS_SOURCE.title });
    expect(source).toHaveAttribute("href", CROSSFIT_DEFINITIONS_SOURCE.url);
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(DOMAIN_BLURBS.Balance)).toBeInTheDocument();
  });
});
