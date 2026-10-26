/**
 * Monte Carlo simulation of a class's FAT results and the relative grading that follows.
 *
 * In each simulated run:
 *   1. Draw a shared paper-difficulty shock δ ~ N(0, τ²).
 *   2. For every student i draw FATᵢ = ŷᵢ + δ + σᵢ·T_df   (clamped to 0–100, rounded),
 *      where σᵢ² = SE_pred,ᵢ² − τ² is the student's individual uncertainty.
 *   3. Compute totals, the class mean μ and SD σ, and the grade cutoffs μ + k·σ.
 *   4. Grade every student.
 *
 * Repeating this thousands of times gives each student's grade probabilities and
 * the distribution of the cutoffs themselves (the "grade ranges").
 */
import { createRng } from "./random";
import { predictionInterval, type OLSFit, type Prediction } from "./regression";
import { quantile } from "./stats";
import {
  FAT_FACTOR,
  GRADE_POINTS,
  GRADES,
  PASS_GRADES,
  gradeOf,
  type Cutoffs,
  type Grade,
  type GradingRules,
  type PassGrade,
} from "./vit";

export interface SimulationInput {
  /** Model predictions for every student in the class. */
  predictions: readonly Prediction[];
  /** Internal marks (out of 60) for every student, same order. */
  internals: readonly number[];
  /** Residual degrees of freedom of the fitted model. */
  df: number;
  /** Between-section SD of the shared FAT shock. */
  tau: number;
  rules: GradingRules;
  nSims: number;
  seed?: number;
  /** Index of a student whose individual FAT/total draws should be kept. */
  trackIndex?: number;
}

export interface ClassSimulation {
  nSims: number;
  method: "relative" | "absolute";
  /** gradeCounts[i][g] = number of runs in which student i got GRADES[g]. */
  gradeCounts: Int32Array[];
  /** Per-run cutoff for each passing grade. */
  cutoffs: Record<PassGrade, Float64Array>;
  classMeans: Float64Array;
  classSds: Float64Array;
  trackedFat: Float64Array | null;
  trackedTotal: Float64Array | null;
}

export function simulateClass(input: SimulationInput): ClassSimulation {
  const { predictions, internals, df, tau, rules, nSims } = input;
  const n = predictions.length;
  const rng = createRng(input.seed ?? 2026);
  const method = n <= rules.absoluteMaxClassSize ? "absolute" : "relative";
  const indSd = predictions.map((p) => Math.sqrt(Math.max(p.sePred ** 2 - tau ** 2, 0.25 * p.sePred ** 2)));

  const gradeCounts = Array.from({ length: n }, () => new Int32Array(GRADES.length));
  const cutoffs = Object.fromEntries(PASS_GRADES.map((g) => [g, new Float64Array(nSims)])) as Record<PassGrade, Float64Array>;
  const classMeans = new Float64Array(nSims);
  const classSds = new Float64Array(nSims);
  const track = input.trackIndex;
  const trackedFat = track !== undefined ? new Float64Array(nSims) : null;
  const trackedTotal = track !== undefined ? new Float64Array(nSims) : null;

  const fats = new Float64Array(n);
  const totals = new Float64Array(n);
  const cut = {} as Cutoffs;

  for (let s = 0; s < nSims; s++) {
    const shock = tau * rng.normal();
    for (let i = 0; i < n; i++) {
      const raw = predictions[i].mean + shock + indSd[i] * rng.studentT(df);
      const fat = Math.min(100, Math.max(0, Math.round(raw)));
      fats[i] = fat;
      totals[i] = internals[i] + FAT_FACTOR * fat;
    }

    // Class mean and SD (optionally leaving out FAT-fail students).
    let cnt = 0;
    let sum = 0;
    let sumSq = 0;
    const exclude = rules.excludeFailsFromStats && rules.enforceFatMinimum;
    for (let i = 0; i < n; i++) {
      if (exclude && fats[i] < rules.fatMinimum) continue;
      cnt++;
      sum += totals[i];
      sumSq += totals[i] * totals[i];
    }
    const mu = cnt ? sum / cnt : 0;
    const sigma = cnt > 1 ? Math.sqrt(Math.max(0, (sumSq - cnt * mu * mu) / (cnt - 1))) : 0;
    classMeans[s] = mu;
    classSds[s] = sigma;
    for (const g of PASS_GRADES) {
      cut[g] = method === "absolute" ? rules.absolute[g] : mu + rules.k[g] * sigma;
      cutoffs[g][s] = cut[g];
    }

    for (let i = 0; i < n; i++) {
      const g = gradeOf(totals[i], fats[i], cut, rules);
      gradeCounts[i][GRADES.indexOf(g)]++;
    }
    if (track !== undefined) {
      trackedFat![s] = fats[track];
      trackedTotal![s] = totals[track];
    }
  }

  return { nSims, method, gradeCounts, cutoffs, classMeans, classSds, trackedFat, trackedTotal };
}

export type GradeProbs = Record<Grade, number>;

export function gradeProbsFor(sim: ClassSimulation, i: number): GradeProbs {
  const out = {} as GradeProbs;
  GRADES.forEach((g, j) => (out[g] = sim.gradeCounts[i][j] / sim.nSims));
  return out;
}

export function mostLikelyGrade(p: GradeProbs): Grade {
  return GRADES.reduce((best, g) => (p[g] > p[best] ? g : best), GRADES[0]);
}

export interface Interval {
  mean: number;
  lo: number;
  hi: number;
}

function summarizeDraws(xs: Float64Array, level = 0.9): Interval {
  const arr = Array.from(xs);
  let s = 0;
  for (const x of arr) s += x;
  return { mean: s / arr.length, lo: quantile(arr, (1 - level) / 2), hi: quantile(arr, 1 - (1 - level) / 2) };
}

// ---------------------------------------------------------------- single-student view

export interface StudentForecast {
  sim: ClassSimulation;
  fat: Prediction & { piLow: number; piHigh: number };
  internal: number;
  probs: GradeProbs;
  /** P(grade is g or better). */
  atLeast: Record<PassGrade, number>;
  mostLikely: Grade;
  expectedGradePoint: number;
  total: Interval;
  /** Predicted grade ranges: 90% interval of each cutoff across runs. */
  cutoffs: Record<PassGrade, Interval>;
  classMean: Interval;
  classSd: Interval;
  /** P(grade | FAT = x) for x = 0…100, using the simulated cutoffs. */
  gradeMap: { fat: number; probs: GradeProbs }[];
}

export function forecastStudent(args: {
  fit: OLSFit;
  target: Prediction;
  targetInternal: number;
  classmates: readonly Prediction[];
  classmateInternals: readonly number[];
  tau: number;
  rules: GradingRules;
  nSims: number;
  seed?: number;
}): StudentForecast {
  const predictions = [...args.classmates, args.target];
  const internals = [...args.classmateInternals, args.targetInternal];
  const idx = predictions.length - 1;
  const sim = simulateClass({
    predictions,
    internals,
    df: args.fit.df,
    tau: args.tau,
    rules: args.rules,
    nSims: args.nSims,
    seed: args.seed,
    trackIndex: idx,
  });
  const probs = gradeProbsFor(sim, idx);

  const atLeast = {} as Record<PassGrade, number>;
  let cum = 0;
  for (const g of PASS_GRADES) {
    cum += probs[g];
    atLeast[g] = cum;
  }

  const expectedGradePoint = GRADES.reduce((s, g) => s + probs[g] * GRADE_POINTS[g], 0);

  const cutoffs = {} as Record<PassGrade, Interval>;
  for (const g of PASS_GRADES) cutoffs[g] = summarizeDraws(sim.cutoffs[g]);

  // Grade map: hold the student's FAT fixed at x and grade it against every run's cutoffs.
  const gradeMap: StudentForecast["gradeMap"] = [];
  const cut = {} as Cutoffs;
  for (let x = 0; x <= 100; x++) {
    const counts = new Array<number>(GRADES.length).fill(0);
    const total = args.targetInternal + FAT_FACTOR * x;
    for (let s = 0; s < sim.nSims; s++) {
      for (const g of PASS_GRADES) cut[g] = sim.cutoffs[g][s];
      counts[GRADES.indexOf(gradeOf(total, x, cut, args.rules))]++;
    }
    const p = {} as GradeProbs;
    GRADES.forEach((g, j) => (p[g] = counts[j] / sim.nSims));
    gradeMap.push({ fat: x, probs: p });
  }

  const [piLow, piHigh] = predictionInterval(args.fit, args.target, 0.95);
  return {
    sim,
    fat: { ...args.target, piLow: Math.max(0, piLow), piHigh: Math.min(100, piHigh) },
    internal: args.targetInternal,
    probs,
    atLeast,
    mostLikely: mostLikelyGrade(probs),
    expectedGradePoint,
    total: summarizeDraws(sim.trackedTotal!, 0.95),
    cutoffs,
    classMean: summarizeDraws(sim.classMeans),
    classSd: summarizeDraws(sim.classSds),
    gradeMap,
  };
}
