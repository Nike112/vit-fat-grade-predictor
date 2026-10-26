/**
 * Seeded pseudo-random number generation.
 *
 * A fixed seed makes every Monte Carlo result reproducible: the same inputs
 * always give the same probabilities, so the UI doesn't flicker on re-render.
 */

export interface Rng {
  /** Uniform on [0, 1). */
  uniform(): number;
  /** Standard normal N(0, 1). */
  normal(): number;
  /** Gamma(shape, scale = 1). */
  gamma(shape: number): number;
  /** Student's t with `df` degrees of freedom. */
  studentT(df: number): number;
}

/** mulberry32 — small, fast, good-quality 32-bit generator. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed = 42): Rng {
  const uniform = mulberry32(seed);
  let spare: number | null = null;

  // Box–Muller, caching the second variate.
  const normal = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = uniform();
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };

  // Marsaglia & Tsang (2000). For shape < 1 use the boost Gamma(a) = Gamma(a+1)·U^(1/a).
  const gamma = (shape: number): number => {
    if (shape < 1) {
      let u = 0;
      while (u === 0) u = uniform();
      return gamma(shape + 1) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = uniform();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };

  // T = Z / sqrt(χ²_ν / ν), with χ²_ν = 2·Gamma(ν/2).
  const studentT = (df: number): number => {
    if (!Number.isFinite(df) || df > 1e6) return normal();
    const chi2 = 2 * gamma(df / 2);
    return normal() / Math.sqrt(chi2 / df);
  };

  return { uniform, normal, gamma, studentT };
}
