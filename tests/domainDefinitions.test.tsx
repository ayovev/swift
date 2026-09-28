import { describe, expect, it } from "vitest";
import { pageSubtitleOf } from "@/components/dashboard/SectionNav";
import { ALIGNMENT_TAB, BODY_COMP_TAB, OVERVIEW_TAB } from "@/components/dashboard/tabs";
import { CROSSFIT_DEFINITIONS, DOMAIN_BLURBS, DOMAIN_LIST } from "@/types/dashboard";

describe("CROSSFIT_DEFINITIONS", () => {
  it("has a definition for every domain, each in CrossFit's 'The ability…' form", () => {
    for (const domain of DOMAIN_LIST) {
      expect(CROSSFIT_DEFINITIONS[domain]).toMatch(/^The ability .+\.$/);
    }
  });

  it("keeps the app's own blurbs from restating the definition", () => {
    for (const domain of DOMAIN_LIST) {
      expect(DOMAIN_BLURBS[domain]).not.toMatch(/^The ability/);
    }
  });
});

describe("pageSubtitleOf", () => {
  it("gives each domain page CrossFit's definition as its subtitle", () => {
    for (const domain of DOMAIN_LIST) {
      expect(pageSubtitleOf(`domain:${domain}`)).toBe(CROSSFIT_DEFINITIONS[domain]);
    }
  });

  it("gives other views no subtitle", () => {
    for (const tab of [OVERVIEW_TAB, BODY_COMP_TAB, ALIGNMENT_TAB, "modality:W"]) {
      expect(pageSubtitleOf(tab)).toBeNull();
    }
  });
});
