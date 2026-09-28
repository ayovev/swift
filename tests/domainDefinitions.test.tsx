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

  it("matches CrossFit's own wording, word for word", () => {
    expect(CROSSFIT_DEFINITIONS).toEqual({
      "Cardiovascular/Respiratory Endurance":
        "The ability of the body’s systems to gather, process, and deliver oxygen.",
      Stamina: "The ability of body systems to process, deliver, store, and utilize energy.",
      Strength: "The ability of a muscular unit, or combination of muscular units, to apply force.",
      Flexibility: "The ability to maximize the range of motion at a given joint.",
      Power:
        "The ability of a muscular unit, or combination of muscular units, to apply maximum force in minimum time.",
      Speed: "The ability to minimize the cycle time of a repeated movement.",
      Coordination:
        "The ability to combine several distinct movement patterns into a singular distinct movement.",
      Agility: "The ability to minimize transition time from one movement pattern to another.",
      Balance:
        "The ability to control the placement of the body’s center of gravity in relation to its support base.",
      Accuracy: "The ability to control movement in a given direction or at a given intensity.",
    });
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
