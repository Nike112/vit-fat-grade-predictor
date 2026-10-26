/**
 * Candidate regression models for predicting FAT marks from internal marks.
 */
import { crossValidate, fitOLS, predict, type OLSFit, type Prediction } from "./regression";
import { mean, variance } from "./stats";
import { internalMarks, type StudentRecord } from "./vit";

export type ModelId = "multiple" | "internal" | "cats";

type Marks = Pick<StudentRecord, "cat1" | "cat2" | "da">;

export interface ModelSpec {
  id: ModelId;
  label: string;
  short: string;
  description: string;
  predictors: { name: string; get: (r: Marks) => number }[];
}

export const MODELS: readonly ModelSpec[] = [
  {
    id: "multiple",
    label: "Multiple regression",
    short: "CAT-1 + CAT-2 + DA",
    description: "FAT ~ CAT-1 + CAT-2 + DA. Each component gets its own weight, so the model can learn that CATs predict FAT better than DAs.",
    predictors: [
      { name: "CAT-1", get: (r) => r.cat1 },
      { name: "CAT-2", get: (r) => r.cat2 },
      { name: "DA", get: (r) => r.da },
    ],
  },
  {
    id: "cats",
    label: "CATs only",
    short: "CAT-1 + CAT-2",
    description: "FAT ~ CAT-1 + CAT-2. Ignores assignments, which are usually high for everyone and carry little information.",
    predictors: [
      { name: "CAT-1", get: (r) => r.cat1 },
      { name: "CAT-2", get: (r) => r.cat2 },
    ],
  },
  {
    id: "internal",
    label: "Simple regression",
    short: "Internal total",
    description: "FAT ~ Internal (out of 60). One predictor: the weighted internal marks exactly as VIT computes them.",
    predictors: [{ name: "Internal", get: (r) => internalMarks(r) }],
  },
];

export function getModel(id: ModelId): ModelSpec {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function featuresOf(spec: ModelSpec, r: Marks): number[] {
  return spec.predictors.map((p) => p.get(r));
}

/** Students with a known FAT score. */
export function withFat(records: readonly StudentRecord[]): (StudentRecord & { fat: number })[] {
  return records.filter((r): r is StudentRecord & { fat: number } => r.fat !== null);
}

export function fitModel(spec: ModelSpec, records: readonly StudentRecord[]): OLSFit {
  const rows = withFat(records);
  return fitOLS(
    rows.map((r) => featuresOf(spec, r)),
    rows.map((r) => r.fat),
    spec.predictors.map((p) => p.name),
  );
}

export function predictFat(fit: OLSFit, spec: ModelSpec, r: Marks): Prediction {
  return predict(fit, featuresOf(spec, r));
}

/**
 * Between-section standard deviation τ of the FAT "paper difficulty" effect.
 *
 * Section mean residuals r̄ₛ satisfy Var(r̄ₛ) ≈ τ² + σ²/nₛ, so the method-of-moments
 * estimate is τ² = max(0, Var(r̄ₛ) − mean(σ²/nₛ)). This shock is shared by every
 * student in a class, which matters for relative grading: a hard paper moves the
 * cutoffs down along with everyone's marks.
 */
export function estimateSectionEffect(fit: OLSFit, records: readonly StudentRecord[]): number {
  const rows = withFat(records);
  const bySection = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const list = bySection.get(r.section) ?? [];
    list.push(fit.residuals[i]);
    bySection.set(r.section, list);
  });
  if (bySection.size < 2) return 0;
  const groups = [...bySection.values()];
  const sectionMeans = groups.map(mean);
  const noise = mean(groups.map((g) => (fit.sigma * fit.sigma) / g.length));
  return Math.sqrt(Math.max(0, variance(sectionMeans) - noise));
}

export interface ModelComparison {
  spec: ModelSpec;
  fit: OLSFit;
  cvRmse: number;
  cvMae: number;
  cvMethod: string;
}

/** Fits every candidate model and scores it with leave-one-section-out CV (10-fold if one section). */
export function compareModels(records: readonly StudentRecord[]): ModelComparison[] {
  const rows = withFat(records);
  const sections = new Set(rows.map((r) => r.section));
  const useSections = sections.size >= 3;
  const folds = useSections ? rows.map((r) => r.section) : rows.map((_, i) => String(i % 10));
  return MODELS.map((spec) => {
    const fit = fitModel(spec, rows);
    const cv = crossValidate(
      rows.map((r) => featuresOf(spec, r)),
      rows.map((r) => r.fat),
      folds,
      spec.predictors.map((p) => p.name),
    );
    return {
      spec,
      fit,
      cvRmse: cv.rmse,
      cvMae: cv.mae,
      cvMethod: useSections ? "leave-one-section-out" : "10-fold",
    };
  });
}
