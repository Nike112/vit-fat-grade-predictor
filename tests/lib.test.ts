import { describe, expect, it } from "vitest";
import { parseMarksCsv } from "../src/lib/csv";
import { fSurvival, normalCdf, normalInv, tCdf, tInv, tTwoSidedP } from "../src/lib/distributions";
import { createRng } from "../src/lib/random";
import { fitOLS, predict, predictionInterval } from "../src/lib/regression";
import { gradeProbsFor, simulateClass } from "../src/lib/simulation";
import { histogram, mean, pearson, quantile, sd, summarize } from "../src/lib/stats";
import { DEFAULT_RULES, fatNeeded, gradeClass, internalMarks, relativeCutoffs, totalMarks } from "../src/lib/vit";

describe("distributions", () => {
  it("normal CDF and inverse match reference values", () => {
    expect(normalCdf(1.5)).toBeCloseTo(0.9331927987311419, 12);
    expect(normalCdf(-1.96)).toBeCloseTo(0.024997895148220435, 12);
    expect(normalCdf(70, 60, 10)).toBeCloseTo(0.8413447460685429, 12);
    expect(normalInv(0.975)).toBeCloseTo(1.959963984540054, 9);
    expect(normalInv(0.001)).toBeCloseTo(-3.090232306167813, 9);
  });

  it("Student t CDF / inverse match tables", () => {
    expect(tInv(0.975, 10)).toBeCloseTo(2.228138851986274, 8);
    expect(tInv(0.975, 3)).toBeCloseTo(3.182446305284263, 8);
    expect(tCdf(2.228138851986274, 10)).toBeCloseTo(0.975, 10);
    expect(tInv(0.975, 1e5)).toBeCloseTo(1.96, 2);
    expect(tTwoSidedP(2.1213203435596424, 3)).toBeCloseTo(0.12402706, 6);
  });

  it("F survival matches the 5% critical value", () => {
    // F(0.95; 3, 100) = 2.6955
    expect(fSurvival(2.6955, 3, 100)).toBeCloseTo(0.05, 3);
  });
});

describe("descriptive statistics", () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  it("computes mean, sd, quantiles", () => {
    expect(mean(xs)).toBe(5);
    expect(sd(xs)).toBeCloseTo(2.138089935, 8);
    expect(quantile(xs, 0.5)).toBe(4.5);
    expect(quantile(xs, 0.25)).toBe(4);
  });
  it("pearson correlation of a perfect line is 1", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
  });
  it("summary skewness is 0 for symmetric data", () => {
    expect(summarize([1, 2, 3, 4, 5]).skewness).toBeCloseTo(0, 12);
  });
  it("histogram counts every value and expected counts sum to ~n", () => {
    const bins = histogram(xs, 0, 10, 2);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(xs.length);
    expect(bins.reduce((s, b) => s + b.expected, 0)).toBeGreaterThan(7.5);
  });
});

describe("OLS regression", () => {
  // Hand-checkable example: ŷ = 2.2 + 0.6x, R² = 0.6, s² = 0.8, SE(slope) = √0.08.
  const x = [[1], [2], [3], [4], [5]];
  const y = [2, 4, 5, 4, 5];
  const fit = fitOLS(x, y, ["x"]);

  it("recovers coefficients and fit statistics", () => {
    expect(fit.coef[0]).toBeCloseTo(2.2, 10);
    expect(fit.coef[1]).toBeCloseTo(0.6, 10);
    expect(fit.r2).toBeCloseTo(0.6, 10);
    expect(fit.sigma).toBeCloseTo(Math.sqrt(0.8), 10);
    expect(fit.se[1]).toBeCloseTo(Math.sqrt(0.08), 10);
    expect(fit.pValue[1]).toBeCloseTo(0.12402706, 6);
    expect(fit.fStat).toBeCloseTo(4.5, 10); // F = t² for one predictor
  });

  it("prediction SE includes the new-observation variance", () => {
    const p = predict(fit, [3]);
    expect(p.mean).toBeCloseTo(4, 10);
    expect(p.leverage).toBeCloseTo(0.2, 10); // 1/n + (x0 − x̄)²/Sxx
    expect(p.sePred).toBeCloseTo(Math.sqrt(0.8 * 1.2), 10);
    const [lo, hi] = predictionInterval(fit, p, 0.95);
    expect(hi - p.mean).toBeCloseTo(3.182446305284263 * Math.sqrt(0.96), 6);
    expect(p.mean - lo).toBeCloseTo(hi - p.mean, 10);
  });

  it("matches a two-predictor fit with an exact solution", () => {
    const rows = [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 3],
    ];
    const yy = rows.map(([a, b]) => 3 + 2 * a - b);
    const f = fitOLS(rows, yy, ["a", "b"]);
    expect(f.coef[0]).toBeCloseTo(3, 9);
    expect(f.coef[1]).toBeCloseTo(2, 9);
    expect(f.coef[2]).toBeCloseTo(-1, 9);
  });
});

describe("VIT grading", () => {
  it("weights internal and total marks correctly", () => {
    expect(internalMarks({ cat1: 50, cat2: 50, da: 30 })).toBeCloseTo(60, 10);
    expect(internalMarks({ cat1: 30, cat2: 40, da: 25 })).toBeCloseTo(9 + 12 + 25, 10);
    expect(totalMarks(46, 70)).toBeCloseTo(74, 10);
  });

  it("builds relative cutoffs at mean + k·SD", () => {
    const c = relativeCutoffs(65, 10, DEFAULT_RULES);
    expect(c.S).toBe(80);
    expect(c.A).toBe(70);
    expect(c.B).toBe(60);
    expect(c.C).toBe(55);
    expect(c.D).toBe(50);
    expect(c.E).toBe(45);
  });

  it("applies the FAT minimum and the absolute rule for small classes", () => {
    const internals = [50, 40, 30, 55, 45, 35, 52, 44, 38, 49, 41, 33];
    const fats = [80, 60, 35, 95, 70, 45, 85, 65, 50, 75, 62, 39];
    const g = gradeClass(internals, fats, DEFAULT_RULES);
    expect(g.method).toBe("relative");
    expect(g.grades[2]).toBe("F"); // FAT 35 < 40
    expect(g.grades[11]).toBe("F"); // FAT 39 < 40
    expect(g.grades[3]).toBe("S");

    const small = gradeClass(internals.slice(0, 5), fats.slice(0, 5), DEFAULT_RULES);
    expect(small.method).toBe("absolute");
    expect(small.grades[3]).toBe("S"); // 55 + 38 = 93 ≥ 90
  });

  it("computes the FAT needed for a cutoff", () => {
    expect(fatNeeded(40, 70, DEFAULT_RULES)).toBeCloseTo(75, 10);
    expect(fatNeeded(58, 60, DEFAULT_RULES)).toBe(40); // FAT minimum dominates
  });
});

describe("Monte Carlo simulation", () => {
  const preds = Array.from({ length: 40 }, (_, i) => ({ mean: 40 + i, seMean: 1, sePred: 8, leverage: 0.02 }));
  const internals = Array.from({ length: 40 }, (_, i) => 25 + i * 0.7);
  const base = { predictions: preds, internals, df: 200, tau: 3, rules: DEFAULT_RULES, nSims: 2000, seed: 11 };

  it("gives probabilities that sum to one and is reproducible", () => {
    const a = simulateClass(base);
    const b = simulateClass(base);
    for (let i = 0; i < preds.length; i++) {
      const p = gradeProbsFor(a, i);
      expect(Object.values(p).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
      expect(gradeProbsFor(b, i)).toEqual(p);
    }
  });

  it("ranks stronger students into better grades", () => {
    const sim = simulateClass(base);
    const top = gradeProbsFor(sim, 39);
    const bottom = gradeProbsFor(sim, 0);
    expect(top.S + top.A).toBeGreaterThan(0.8);
    expect(bottom.F).toBeGreaterThan(0.3);
  });

  it("seeded RNG produces standard-normal and t draws", () => {
    const rng = createRng(1);
    const zs = Array.from({ length: 20000 }, () => rng.normal());
    expect(Math.abs(mean(zs))).toBeLessThan(0.03);
    expect(Math.abs(sd(zs) - 1)).toBeLessThan(0.03);
    const ts = Array.from({ length: 20000 }, () => rng.studentT(5));
    expect(Math.abs(sd(ts) - Math.sqrt(5 / 3))).toBeLessThan(0.08);
  });
});

describe("CSV parsing", () => {
  it("reads aliased headers and sums DA parts", () => {
    const csv = "Reg No,Slot,CAT 1,CAT-2,DA1,DA2,DA3,FAT\nX1,A1,30,40,9,8,7,70\nX2,A1,55,40,9,8,7,70\nX3,A1,20,25,6,7,,45\n";
    const r = parseMarksCsv(csv, { requireFat: true });
    expect(r.records).toHaveLength(2);
    expect(r.records[0]).toEqual({ id: "X1", section: "A1", cat1: 30, cat2: 40, da: 24, fat: 70 });
    expect(r.records[1].da).toBe(13);
    expect(r.skipped).toBe(1);
  });

  it("reports missing required columns", () => {
    const r = parseMarksCsv("cat1,cat2\n1,2\n", { requireFat: true });
    expect(r.records).toHaveLength(0);
    expect(r.issues[0]).toMatch(/Missing column/);
  });
});
