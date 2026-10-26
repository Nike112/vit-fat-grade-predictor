/**
 * VIT theory-course assessment scheme and grading rules.
 *
 *   Component        Raw max   Weightage
 *   CAT-1               50        15
 *   CAT-2               50        15
 *   DA / Quiz (×3)      30        30
 *   FAT                100        40
 *   ─────────────────────────────────
 *   Total                         100
 *
 * Relative grading (classes larger than ~10 students): with μ and σ the mean and
 * standard deviation of the class's totals, a student gets grade g when
 * total ≥ μ + k_g·σ. A FAT score below 40/100 is an F regardless of total.
 * Small classes use absolute grading (S ≥ 90, A ≥ 80, …, E ≥ 50).
 */
import { mean, sd } from "./stats";

export const GRADES = ["S", "A", "B", "C", "D", "E", "F"] as const;
export type Grade = (typeof GRADES)[number];
/** Grades that have a lower cutoff (everything except F). */
export type PassGrade = Exclude<Grade, "F">;
export const PASS_GRADES: readonly PassGrade[] = ["S", "A", "B", "C", "D", "E"];

export const GRADE_POINTS: Record<Grade, number> = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0 };

export const SCHEME = {
  cat1: { label: "CAT-1", max: 50, weight: 15 },
  cat2: { label: "CAT-2", max: 50, weight: 15 },
  da: { label: "DA / Quiz", max: 30, weight: 30, parts: 3, partMax: 10 },
  fat: { label: "FAT", max: 100, weight: 40 },
} as const;

export const FAT_FACTOR = SCHEME.fat.weight / SCHEME.fat.max; // 0.4
const CAT_FACTOR = SCHEME.cat1.weight / SCHEME.cat1.max; // 0.3

/** One student's marks. `da` is the DA/quiz total out of 30. `fat` is null when not yet written. */
export interface StudentRecord {
  id: string;
  section: string;
  cat1: number;
  cat2: number;
  da: number;
  fat: number | null;
}

/** Weighted internal (continuous assessment) marks, out of 60. */
export function internalMarks(r: Pick<StudentRecord, "cat1" | "cat2" | "da">): number {
  return CAT_FACTOR * r.cat1 + CAT_FACTOR * r.cat2 + r.da;
}

/** Final total out of 100. */
export function totalMarks(internal: number, fat: number): number {
  return internal + FAT_FACTOR * fat;
}

export interface GradingRules {
  /** Lower boundary of each grade, in standard deviations from the class mean. */
  k: Record<PassGrade, number>;
  /** Apply the FAT minimum (a FAT below `fatMinimum` is an F). */
  enforceFatMinimum: boolean;
  fatMinimum: number;
  /** Leave FAT-fail students out when computing the class mean and SD. */
  excludeFailsFromStats: boolean;
  /** Classes with at most this many students are graded absolutely. */
  absoluteMaxClassSize: number;
  /** Absolute grading lower boundaries (total out of 100). */
  absolute: Record<PassGrade, number>;
}

export const DEFAULT_RULES: GradingRules = {
  k: { S: 1.5, A: 0.5, B: -0.5, C: -1.0, D: -1.5, E: -2.0 },
  enforceFatMinimum: true,
  fatMinimum: 40,
  excludeFailsFromStats: false,
  absoluteMaxClassSize: 10,
  absolute: { S: 90, A: 80, B: 70, C: 60, D: 55, E: 50 },
};

/** Lower total-mark boundary for each passing grade. */
export type Cutoffs = Record<PassGrade, number>;

export function relativeCutoffs(mu: number, sigma: number, rules: GradingRules): Cutoffs {
  const out = {} as Cutoffs;
  for (const g of PASS_GRADES) out[g] = mu + rules.k[g] * sigma;
  return out;
}

export function gradeOf(total: number, fat: number, cutoffs: Cutoffs, rules: GradingRules): Grade {
  if (rules.enforceFatMinimum && fat < rules.fatMinimum) return "F";
  for (const g of PASS_GRADES) if (total >= cutoffs[g]) return g;
  return "F";
}

export interface ClassGrading {
  method: "relative" | "absolute";
  mean: number;
  sd: number;
  cutoffs: Cutoffs;
  grades: Grade[];
}

/** Grades a whole class from its internal marks and FAT scores. */
export function gradeClass(internals: readonly number[], fats: readonly number[], rules: GradingRules): ClassGrading {
  const totals = internals.map((x, i) => totalMarks(x, fats[i]));
  const statPool = rules.excludeFailsFromStats && rules.enforceFatMinimum ? totals.filter((_, i) => fats[i] >= rules.fatMinimum) : totals;
  const mu = mean(statPool);
  const sigma = sd(statPool);
  const method = totals.length <= rules.absoluteMaxClassSize ? "absolute" : "relative";
  const cutoffs = method === "absolute" ? { ...rules.absolute } : relativeCutoffs(mu, sigma, rules);
  return {
    method,
    mean: mu,
    sd: sigma,
    cutoffs,
    grades: totals.map((t, i) => gradeOf(t, fats[i], cutoffs, rules)),
  };
}

/** FAT score (out of 100) needed to reach `cutoff`, honouring the FAT minimum. */
export function fatNeeded(internal: number, cutoff: number, rules: GradingRules): number {
  const raw = (cutoff - internal) / FAT_FACTOR;
  return rules.enforceFatMinimum ? Math.max(raw, rules.fatMinimum) : Math.max(raw, 0);
}

export function gradeIndex(g: Grade): number {
  return GRADES.indexOf(g);
}
