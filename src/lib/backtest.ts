/**
 * Leave-one-section-out backtest of grade predictions.
 *
 * For every past section: fit the model on the OTHER sections, predict this
 * section's FAT marks, simulate its relative grading, and compare the most
 * likely grade with the grade students actually received.
 */
import { estimateSectionEffect, featuresOf, withFat, type ModelSpec } from "./model";
import { fitOLS, predict } from "./regression";
import { gradeProbsFor, mostLikelyGrade, simulateClass } from "./simulation";
import { GRADES, gradeClass, internalMarks, type GradingRules, type StudentRecord } from "./vit";

export interface BacktestResult {
  n: number;
  sections: number;
  /** Share of students whose most likely grade was exactly right. */
  exactAccuracy: number;
  /** Share within one grade of the actual grade. */
  withinOne: number;
  /** Average probability the model gave to the grade that actually happened. */
  meanProbActual: number;
  /** Accuracy of always guessing the most common grade (baseline). */
  baselineAccuracy: number;
  baselineGrade: string;
  /** confusion[actual][predicted] counts, indexed like GRADES. */
  confusion: number[][];
  fatRmse: number;
  fatMae: number;
}

export function backtestGrades(spec: ModelSpec, records: readonly StudentRecord[], rules: GradingRules, nSims = 800): BacktestResult | null {
  const rows = withFat(records);
  const sections = [...new Set(rows.map((r) => r.section))];
  if (sections.length < 2) return null;

  const confusion = GRADES.map(() => new Array<number>(GRADES.length).fill(0));
  let n = 0;
  let exact = 0;
  let within = 0;
  let probSum = 0;
  let se = 0;
  let ae = 0;
  const actualCounts = new Array<number>(GRADES.length).fill(0);

  sections.forEach((section, si) => {
    const test = rows.filter((r) => r.section === section);
    const train = rows.filter((r) => r.section !== section);
    if (test.length < 2 || train.length <= spec.predictors.length + 2) return;
    const fit = fitOLS(
      train.map((r) => featuresOf(spec, r)),
      train.map((r) => r.fat),
      spec.predictors.map((p) => p.name),
    );
    const tau = estimateSectionEffect(fit, train);
    const preds = test.map((r) => predict(fit, featuresOf(spec, r)));
    const internals = test.map(internalMarks);
    const actual = gradeClass(
      internals,
      test.map((r) => r.fat),
      rules,
    ).grades;
    const sim = simulateClass({ predictions: preds, internals, df: fit.df, tau, rules, nSims, seed: 7 + si });

    test.forEach((r, i) => {
      const probs = gradeProbsFor(sim, i);
      const predicted = mostLikelyGrade(probs);
      const a = GRADES.indexOf(actual[i]);
      const p = GRADES.indexOf(predicted);
      confusion[a][p]++;
      actualCounts[a]++;
      n++;
      if (a === p) exact++;
      if (Math.abs(a - p) <= 1) within++;
      probSum += probs[actual[i]];
      const err = r.fat - preds[i].mean;
      se += err * err;
      ae += Math.abs(err);
    });
  });

  if (n === 0) return null;
  const baseIdx = actualCounts.indexOf(Math.max(...actualCounts));
  return {
    n,
    sections: sections.length,
    exactAccuracy: exact / n,
    withinOne: within / n,
    meanProbActual: probSum / n,
    baselineAccuracy: actualCounts[baseIdx] / n,
    baselineGrade: GRADES[baseIdx],
    confusion,
    fatRmse: Math.sqrt(se / n),
    fatMae: ae / n,
  };
}
