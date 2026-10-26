/**
 * Ordinary least squares regression with full inference:
 * coefficients, standard errors, t-tests, R², F-test and prediction intervals.
 *
 *   β̂ = (XᵀX)⁻¹ Xᵀy          s² = RSS / (n − p)
 *   SE(β̂ⱼ) = s·√[(XᵀX)⁻¹]ⱼⱼ
 *   Prediction SE at x₀ = s·√(1 + x₀ᵀ(XᵀX)⁻¹x₀)
 */
import { fSurvival, tInv, tTwoSidedP } from "./distributions";
import { mean } from "./stats";

type Matrix = number[][];

function transposeMultiply(a: Matrix): Matrix {
  // Computes AᵀA for an n×p matrix.
  const p = a[0].length;
  const out: Matrix = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (const row of a) {
    for (let i = 0; i < p; i++) {
      const ri = row[i];
      for (let j = i; j < p; j++) out[i][j] += ri * row[j];
    }
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) out[i][j] = out[j][i];
  return out;
}

/** Gauss–Jordan inversion with partial pivoting. Throws on a singular matrix. */
export function invert(m: Matrix): Matrix {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("Matrix is singular — predictors are collinear or constant.");
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const pv = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

export interface OLSFit {
  /** Term names, starting with "(Intercept)". */
  names: string[];
  coef: number[];
  se: number[];
  tStat: number[];
  pValue: number[];
  ciLow: number[];
  ciHigh: number[];
  n: number;
  /** Number of parameters including the intercept. */
  p: number;
  /** Residual degrees of freedom n − p. */
  df: number;
  rss: number;
  r2: number;
  adjR2: number;
  /** Residual standard error s. */
  sigma: number;
  fStat: number;
  fPValue: number;
  aic: number;
  xtxInv: Matrix;
  fitted: number[];
  residuals: number[];
}

/**
 * Fits y = β₀ + β₁x₁ + … + βₖxₖ + ε.
 * @param rows predictor rows (without the intercept column)
 */
export function fitOLS(rows: readonly number[][], y: readonly number[], predictorNames: string[]): OLSFit {
  const n = rows.length;
  const X = rows.map((r) => [1, ...r]);
  const p = X[0].length;
  if (n <= p) throw new Error(`Need more than ${p} students to fit this model (have ${n}).`);
  const xtxInv = invert(transposeMultiply(X));
  const xty = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) xty[j] += X[i][j] * y[i];
  const coef = xtxInv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));

  const fitted = X.map((row) => row.reduce((s, v, j) => s + v * coef[j], 0));
  const residuals = y.map((v, i) => v - fitted[i]);
  const rss = residuals.reduce((s, r) => s + r * r, 0);
  const ybar = mean(y);
  const tss = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const df = n - p;
  const sigma2 = rss / df;
  const sigma = Math.sqrt(sigma2);
  const r2 = 1 - rss / tss;
  const adjR2 = 1 - (1 - r2) * ((n - 1) / df);
  const k = p - 1;
  const fStat = k > 0 ? ((tss - rss) / k) / sigma2 : NaN;
  const fPValue = k > 0 ? fSurvival(fStat, k, df) : NaN;
  const tCrit = tInv(0.975, df);

  const se = coef.map((_, j) => Math.sqrt(sigma2 * xtxInv[j][j]));
  const tStat = coef.map((b, j) => b / se[j]);
  const pValue = tStat.map((t) => tTwoSidedP(t, df));

  return {
    names: ["(Intercept)", ...predictorNames],
    coef,
    se,
    tStat,
    pValue,
    ciLow: coef.map((b, j) => b - tCrit * se[j]),
    ciHigh: coef.map((b, j) => b + tCrit * se[j]),
    n,
    p,
    df,
    rss,
    r2,
    adjR2,
    sigma,
    fStat,
    fPValue,
    aic: n * Math.log(rss / n) + 2 * p,
    xtxInv,
    fitted,
    residuals,
  };
}

export interface Prediction {
  /** Point prediction ŷ₀. */
  mean: number;
  /** Standard error of the fitted mean at x₀. */
  seMean: number;
  /** Standard error for a new individual observation at x₀. */
  sePred: number;
  /** Leverage h₀ = x₀ᵀ(XᵀX)⁻¹x₀. */
  leverage: number;
}

export function predict(fit: OLSFit, x: readonly number[]): Prediction {
  const x0 = [1, ...x];
  const m = x0.reduce((s, v, j) => s + v * fit.coef[j], 0);
  let h = 0;
  for (let i = 0; i < fit.p; i++) for (let j = 0; j < fit.p; j++) h += x0[i] * fit.xtxInv[i][j] * x0[j];
  return {
    mean: m,
    seMean: fit.sigma * Math.sqrt(h),
    sePred: fit.sigma * Math.sqrt(1 + h),
    leverage: h,
  };
}

/** Two-sided (1 − α) prediction interval for a new observation. */
export function predictionInterval(fit: OLSFit, pred: Prediction, level = 0.95): [number, number] {
  const t = tInv(1 - (1 - level) / 2, fit.df);
  return [pred.mean - t * pred.sePred, pred.mean + t * pred.sePred];
}

export interface CVResult {
  rmse: number;
  mae: number;
  /** Out-of-sample predictions in the original row order. */
  predictions: number[];
}

/**
 * Cross-validation where `folds[i]` names the fold of row i. Pass section names
 * for leave-one-section-out CV, or random fold ids for k-fold CV.
 */
export function crossValidate(rows: readonly number[][], y: readonly number[], folds: readonly string[], names: string[]): CVResult {
  const predictions = new Array<number>(rows.length).fill(NaN);
  for (const f of new Set(folds)) {
    const trainIdx: number[] = [];
    const testIdx: number[] = [];
    folds.forEach((g, i) => (g === f ? testIdx : trainIdx).push(i));
    const fit = fitOLS(
      trainIdx.map((i) => rows[i]),
      trainIdx.map((i) => y[i]),
      names,
    );
    for (const i of testIdx) predictions[i] = predict(fit, rows[i]).mean;
  }
  let se = 0;
  let ae = 0;
  for (let i = 0; i < y.length; i++) {
    const e = y[i] - predictions[i];
    se += e * e;
    ae += Math.abs(e);
  }
  return { rmse: Math.sqrt(se / y.length), mae: ae / y.length, predictions };
}
