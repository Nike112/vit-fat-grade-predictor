/**
 * Probability distributions used by the model: Normal, Student's t, F and χ².
 * Implemented from standard numerical recipes so the app has no stats dependency.
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

// ---------------------------------------------------------------- Normal

export function normalPdf(x: number, mean = 0, sd = 1): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * SQRT_2PI);
}

/**
 * Standard normal CDF Φ(z) — Hart (1968) double-precision algorithm as given by
 * West (2005), "Better approximations to cumulative normal functions".
 */
function standardNormalCdf(z: number): number {
  const x = Math.abs(z);
  let c: number;
  if (x > 37) {
    c = 0;
  } else {
    const e = Math.exp((-x * x) / 2);
    if (x < 7.07106781186547) {
      let n = 3.52624965998911e-2 * x + 0.700383064443688;
      n = n * x + 6.37396220353165;
      n = n * x + 33.912866078383;
      n = n * x + 112.079291497871;
      n = n * x + 221.213596169931;
      n = n * x + 220.206867912376;
      let d = 8.83883476483184e-2 * x + 1.75566716318264;
      d = d * x + 16.064177579207;
      d = d * x + 86.7807322029461;
      d = d * x + 296.564248779674;
      d = d * x + 637.333633378831;
      d = d * x + 793.826512519948;
      d = d * x + 440.413735824752;
      c = (e * n) / d;
    } else {
      let b = x + 0.65;
      b = x + 4 / b;
      b = x + 3 / b;
      b = x + 2 / b;
      b = x + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return z > 0 ? 1 - c : c;
}

export function normalCdf(x: number, mean = 0, sd = 1): number {
  return standardNormalCdf((x - mean) / sd);
}

/** Inverse standard normal CDF — Acklam's algorithm plus one Halley refinement step. */
export function normalInv(p: number, mean = 0, sd = 1): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Halley step
  const e = standardNormalCdf(x) - p;
  const u = e * SQRT_2PI * Math.exp((x * x) / 2);
  x = x - u / (1 + (x * u) / 2);
  return mean + sd * x;
}

// ---------------------------------------------------------------- Gamma / Beta helpers

/** ln Γ(x) — Lanczos approximation (g = 7, n = 9). */
export function logGamma(x: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = coef[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITER = 300;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lnFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

// ---------------------------------------------------------------- Student's t

export function tPdf(t: number, df: number): number {
  const lnC = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  return Math.exp(lnC - ((df + 1) / 2) * Math.log(1 + (t * t) / df));
}

export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const tail = 0.5 * incompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Two-sided p-value for an observed t statistic. */
export function tTwoSidedP(t: number, df: number): number {
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Inverse t CDF by Newton's method from a normal starting point (bisection fallback). */
export function tInv(p: number, df: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let x = normalInv(p);
  for (let i = 0; i < 50; i++) {
    const err = tCdf(x, df) - p;
    const step = err / tPdf(x, df);
    if (!Number.isFinite(step)) break;
    x -= step;
    if (Math.abs(step) < 1e-12) return x;
  }
  // Fallback: bisection
  let lo = -1e4;
  let hi = 1e4;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- F and χ²

/** Upper-tail probability P(F > f) for F(d1, d2). */
export function fSurvival(f: number, d1: number, d2: number): number {
  if (f <= 0) return 1;
  return incompleteBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

/** Upper-tail probability of χ² with 2 degrees of freedom (used by Jarque–Bera). */
export function chiSquare2Survival(x: number): number {
  return x <= 0 ? 1 : Math.exp(-x / 2);
}
