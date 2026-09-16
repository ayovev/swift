import type { Granularity } from "@/lib/analytics/granularity";

export interface BodyCompPoint {
  bucket: string;
  weight: number | null;
  skeletalMuscleMass: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  inbodyScore: number | null;
}

export interface BodyCompData {
  granularity: Granularity;
  points: BodyCompPoint[];
}
