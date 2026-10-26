/** Descriptive statistics, correlation, histograms and normality diagnostics. */
import { chiSquare2Survival, normalCdf, normalInv } from "./distributions";

export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: readonly number[]): number {
  return xs.length ? sum(xs) / xs.length : NaN;
}

/** Sample variance (n − 1 denominator). */
export function variance(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (n - 1);
}

export function sd(xs: readonly number[]): number {
  return Math.sqrt(variance(xs));
}

/** Quantile with linear interpolation between order statistics (R type 7 / Excel). */
export function quantile(xs: readonly number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export const median = (xs: readonly number[]) => quantile(xs, 0.5);

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

export interface Summary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** Sample skewness (moment estimator, g1). */
  skewness: number;
  /** Excess kurtosis (moment estimator, g2). */
  kurtosis: number;
  /** Jarque–Bera normality test statistic and p-value. */
  jarqueBera: number;
  jbPValue: number;
}

export function summarize(xs: readonly number[]): Summary {
  const n = xs.length;
  const m = mean(xs);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - m;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const skewness = m3 / Math.pow(m2, 1.5);
  const kurtosis = m4 / (m2 * m2) - 3;
  const jarqueBera = (n / 6) * (skewness ** 2 + kurtosis ** 2 / 4);
  return {
    n,
    mean: m,
    sd: sd(xs),
    min: Math.min(...xs),
    q1: quantile(xs, 0.25),
    median: quantile(xs, 0.5),
    q3: quantile(xs, 0.75),
    max: Math.max(...xs),
    skewness,
    kurtosis,
    jarqueBera,
    jbPValue: chiSquare2Survival(jarqueBera),
  };
}

export interface HistogramBin {
  /** Inclusive lower edge. */
  x0: number;
  /** Exclusive upper edge (inclusive for the last bin). */
  x1: number;
  mid: number;
  count: number;
  /** Expected count under a normal distribution fitted to the data. */
  expected: number;
}

/** Fixed-width histogram plus expected counts from the fitted normal N(x̄, s²). */
export function histogram(xs: readonly number[], lo: number, hi: number, binWidth: number): HistogramBin[] {
  const nBins = Math.max(1, Math.ceil((hi - lo) / binWidth));
  const bins: HistogramBin[] = Array.from({ length: nBins }, (_, i) => {
    const x0 = lo + i * binWidth;
    const x1 = x0 + binWidth;
    return { x0, x1, mid: (x0 + x1) / 2, count: 0, expected: 0 };
  });
  for (const x of xs) {
    const i = Math.min(nBins - 1, Math.max(0, Math.floor((x - lo) / binWidth)));
    bins[i].count++;
  }
  const m = mean(xs);
  const s = sd(xs);
  if (xs.length > 1 && s > 0) {
    for (const b of bins) b.expected = xs.length * (normalCdf(b.x1, m, s) - normalCdf(b.x0, m, s));
  }
  return bins;
}

export interface QQPoint {
  theoretical: number;
  sample: number;
}

/** Normal Q-Q plot points using Blom plotting positions (i − 3/8)/(n + 1/4). */
export function qqPoints(xs: readonly number[]): QQPoint[] {
  const n = xs.length;
  const m = mean(xs);
  const s = sd(xs);
  return [...xs]
    .sort((a, b) => a - b)
    .map((x, i) => ({ theoretical: normalInv((i + 1 - 0.375) / (n + 0.25)), sample: (x - m) / s }));
}

/** 95% confidence interval for a mean using the t distribution critical value supplied. */
export function meanCI(xs: readonly number[], tCrit: number): [number, number] {
  const m = mean(xs);
  const half = (tCrit * sd(xs)) / Math.sqrt(xs.length);
  return [m - half, m + half];
}
