/** InBody scans as the body readings the context lines read. Lean mass is Soft Lean Mass where present, else Skeletal Muscle Mass. */
import type { InBodyRow } from "@/types/inbody";
import { getBodyCompNoiseBands } from "../bodyCompNoise";
import { DEFAULT_NOISE_BAND } from "../insightConfig";
import { parseInBodyDate, parseNumericField } from "../scanParsing";
import type { BodyReading } from "./bodyContext";

export function readingsFromInBody(rows: readonly InBodyRow[]): BodyReading[] {
  const out: BodyReading[] = [];
  for (const r of rows) {
    const date = parseInBodyDate(r.date);
    const weight = parseNumericField(r["Weight(lb)"]);
    if (!date.isValid() || weight === null) continue;
    const lean = parseNumericField(r["Soft Lean Mass(lb)"]) ?? parseNumericField(r["Skeletal Muscle Mass(lb)"]);
    const fat = parseNumericField(r["Body Fat Mass(lb)"]);
    out.push({ date: date.format("YYYY-MM-DD"), weightLb: weight, ...(lean !== null ? { leanLb: lean } : {}), ...(fat !== null ? { fatLb: fat } : {}) });
  }
  return out;
}

/** The weight noise band: measured from the scans where possible, else the 3 lb default. */
export function weightBandLb(rows: readonly InBodyRow[]): number {
  const band = getBodyCompNoiseBands([...rows]).weight;
  return band.status === "ok" ? band.band : DEFAULT_NOISE_BAND.weight;
}
