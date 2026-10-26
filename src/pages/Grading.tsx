import { useMemo, useState } from "react";
import { GradedHistogram, type GradedBin } from "../components/charts/GradingCharts";
import { Card, ChartCard, DataTable, GradeChip, Legend, PageHead } from "../components/ui";
import { normalCdf } from "../lib/distributions";
import { fmt, pct } from "../lib/format";
import { mean, sd } from "../lib/stats";
import { DEFAULT_RULES, GRADE_POINTS, GRADES, PASS_GRADES, relativeCutoffs, SCHEME, type Cutoffs, type Grade, type PassGrade } from "../lib/vit";
import { useApp } from "../state/AppState";

function gradeForValue(v: number, cutoffs: Cutoffs): Grade {
  for (const g of PASS_GRADES) if (v >= cutoffs[g]) return g;
  return "F";
}

function buildBins(values: number[], lo: number, hi: number, width: number, cutoffs: Cutoffs, mu: number, sigma: number): GradedBin[] {
  const n = Math.ceil((hi - lo) / width);
  const bins: GradedBin[] = Array.from({ length: n }, (_, i) => {
    const x0 = lo + i * width;
    const x1 = x0 + width;
    const mid = (x0 + x1) / 2;
    return { x0, x1, mid, count: 0, expected: values.length * (normalCdf(x1, mu, sigma) - normalCdf(x0, mu, sigma)), grade: gradeForValue(mid, cutoffs) };
  });
  for (const v of values) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((v - lo) / width)));
    bins[i].count++;
  }
  return bins;
}

export default function Grading() {
  const { analysis, rules, setRules, chart } = useApp();
  const [picked, setSection] = useState("all");
  // Fall back to all sections if the chosen one disappears after a data upload.
  const section = analysis?.sections.includes(picked) ? picked : "all";

  const view = useMemo(() => {
    if (!analysis) return null;
    if (section === "all") {
      // Pool every section on a common scale: z = (total − μₛ)/σₛ.
      const z: number[] = [];
      for (const s of analysis.sections) {
        const totals = analysis.graded.filter((r) => r.section === s).map((r) => r.total);
        const m = mean(totals);
        const v = sd(totals);
        for (const t of totals) z.push((t - m) / v);
      }
      const cut = relativeCutoffs(0, 1, rules);
      return {
        bins: buildBins(z, -3.5, 3, 0.25, cut, 0, 1),
        ticks: [-3, -2, -1, 0, 1, 2, 3],
        cutoffs: cut,
        xLabel: "Standardised total z = (total − μ) / σ, all sections pooled",
        label: (g: PassGrade) => `${g} ${rules.k[g] >= 0 ? "+" : "−"}${Math.abs(rules.k[g])}σ`,
        binLabel: (b: GradedBin) => `z ${fmt(b.x0, 2)} to ${fmt(b.x1, 2)}`,
        mu: 0,
        sigma: 1,
        n: z.length,
      };
    }
    const totals = analysis.graded.filter((r) => r.section === section).map((r) => r.total);
    const mu = mean(totals);
    const sigma = sd(totals);
    const cut = relativeCutoffs(mu, sigma, rules);
    const lo = Math.max(0, Math.floor(Math.min(...totals, cut.E) / 5) * 5 - 5);
    return {
      bins: buildBins(totals, lo, 100, 2, cut, mu, sigma),
      ticks: Array.from({ length: Math.floor((100 - lo) / 10) + 1 }, (_, i) => 100 - (Math.floor((100 - lo) / 10) - i) * 10),
      cutoffs: cut,
      xLabel: `Total marks (out of 100) · μ = ${fmt(mu)}, σ = ${fmt(sigma)}`,
      label: (g: PassGrade) => `${g} ${fmt(cut[g])}`,
      binLabel: (b: GradedBin) => `${fmt(b.x0, 0)}–${fmt(b.x1, 0)} marks`,
      mu,
      sigma,
      n: totals.length,
    };
  }, [analysis, section, rules]);

  const theory = useMemo(() => {
    const out: { grade: Grade; points: number; rule: string; share: number }[] = [];
    let above = 0;
    for (const g of PASS_GRADES) {
      const pAtLeast = 1 - normalCdf(rules.k[g]);
      out.push({ grade: g, points: GRADE_POINTS[g], rule: `total ≥ μ ${rules.k[g] >= 0 ? "+" : "−"} ${Math.abs(rules.k[g])}σ`, share: pAtLeast - above });
      above = pAtLeast;
    }
    out.push({ grade: "F", points: 0, rule: `total < μ − ${Math.abs(rules.k.E)}σ${rules.enforceFatMinimum ? ` or FAT < ${rules.fatMinimum}` : ""}`, share: 1 - above });
    return out;
  }, [rules]);

  const setK = (g: PassGrade, v: number) => setRules({ ...rules, k: { ...rules.k, [g]: v } });
  const setAbs = (g: PassGrade, v: number) => setRules({ ...rules, absolute: { ...rules.absolute, [g]: v } });

  return (
    <>
      <PageHead
        title="VIT grading rules"
        description="How internal and FAT marks combine, and how relative grading turns totals into grades. The rules below drive every prediction in the app — adjust them if your course or faculty uses different numbers."
      />
      <div className="stack">
        <div className="grid grid-2">
          <Card title="Marks scheme (theory course)" subtitle="Raw marks are scaled to their weightage and added up to a total out of 100">
            <DataTable
              columns={[
                { key: "c", label: "Component" },
                { key: "max", label: "Raw marks", num: true },
                { key: "w", label: "Weightage", num: true },
                { key: "f", label: "Conversion", num: true },
              ]}
              rows={[
                { c: SCHEME.cat1.label, max: SCHEME.cat1.max, w: SCHEME.cat1.weight, f: "× 0.3" },
                { c: SCHEME.cat2.label, max: SCHEME.cat2.max, w: SCHEME.cat2.weight, f: "× 0.3" },
                { c: "DA / Quiz (3 × 10)", max: SCHEME.da.max, w: SCHEME.da.weight, f: "× 1" },
                { c: "Internal (CAM)", max: "—", w: 60, f: "sum" },
                { c: SCHEME.fat.label, max: SCHEME.fat.max, w: SCHEME.fat.weight, f: "× 0.4" },
                { c: "Total", max: "—", w: 100, f: "" },
              ]}
            />
          </Card>
          <Card title="Relative grading" subtitle="μ and σ are the mean and standard deviation of the class's totals. Share = what a perfectly normal class would get.">
            <DataTable
              columns={[
                { key: "grade", label: "Grade", render: (r) => <GradeChip grade={r.grade} /> },
                { key: "points", label: "Points", num: true },
                { key: "rule", label: "Rule" },
                { key: "share", label: "Normal share", num: true, render: (r) => pct(r.share, 1) },
              ]}
              rows={theory}
            />
          </Card>
        </div>

        <ChartCard
          title="Totals and grade cutoffs"
          subtitle="Bars are coloured by the grade their range earns; the line is the normal curve with the same mean and SD."
          extra={
            <select className="select" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
              <option value="all">All sections (z-scores)</option>
              {analysis?.sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          }
          table={
            view
              ? {
                  columns: [
                    { key: "range", label: "Range", render: (b: GradedBin) => view.binLabel(b) },
                    { key: "grade", label: "Grade", render: (b: GradedBin) => <GradeChip grade={b.grade} /> },
                    { key: "count", label: "Students", num: true },
                    { key: "expected", label: "Normal curve", num: true, render: (b: GradedBin) => fmt(b.expected) },
                  ],
                  rows: view.bins.filter((b) => b.count > 0 || b.expected > 0.5),
                }
              : undefined
          }
          foot={rules.enforceFatMinimum ? `Students below the FAT minimum get F regardless of where their total falls, so some F grades sit inside the coloured bands.` : undefined}
        >
          <Legend items={GRADES.map((g) => ({ label: g, color: chart.grade[g] }))} />
          {view && <GradedHistogram bins={view.bins} cutoffs={view.cutoffs} xLabel={view.xLabel} ticks={view.ticks} cutoffLabel={view.label} binLabel={view.binLabel} />}
        </ChartCard>

        <Card
          title="Adjust the rules"
          subtitle="Commonly reported VIT defaults are pre-filled. Changes are saved in your browser and apply to every page."
          actions={
            <button className="btn" type="button" onClick={() => setRules(DEFAULT_RULES)}>
              Reset to defaults
            </button>
          }
        >
          <div className="grid grid-3">
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>
                Relative cutoffs (k in μ + kσ)
              </div>
              <RuleInputs values={rules.k} step={0.1} onChange={setK} />
            </div>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>
                Absolute cutoffs (total ≥)
              </div>
              <RuleInputs values={rules.absolute} step={1} onChange={setAbs} />
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <label className="check">
                <input type="checkbox" checked={rules.enforceFatMinimum} onChange={(e) => setRules({ ...rules, enforceFatMinimum: e.target.checked })} />
                <span>Fail anyone who scores below the FAT minimum</span>
              </label>
              <div className="field-row" style={{ justifyContent: "flex-start", alignItems: "center", gap: 10, paddingLeft: 24 }}>
                <span className="small ink-2">FAT minimum</span>
                <input
                  className="num-input"
                  style={{ width: 64 }}
                  type="number"
                  min={0}
                  max={100}
                  value={rules.fatMinimum}
                  disabled={!rules.enforceFatMinimum}
                  onChange={(e) => setRules({ ...rules, fatMinimum: clampNum(e.target.value, 0, 100, rules.fatMinimum) })}
                  aria-label="FAT minimum"
                />
                <span className="small muted">/ 100</span>
              </div>
              <label className="check">
                <input type="checkbox" checked={rules.excludeFailsFromStats} onChange={(e) => setRules({ ...rules, excludeFailsFromStats: e.target.checked })} />
                <span>Leave FAT-fail students out of the class mean and SD</span>
              </label>
              <div className="field-row" style={{ justifyContent: "flex-start", alignItems: "center", gap: 10 }}>
                <span className="small ink-2">Absolute grading for classes of ≤</span>
                <input
                  className="num-input"
                  style={{ width: 64 }}
                  type="number"
                  min={0}
                  max={500}
                  value={rules.absoluteMaxClassSize}
                  onChange={(e) => setRules({ ...rules, absoluteMaxClassSize: clampNum(e.target.value, 0, 500, rules.absoluteMaxClassSize) })}
                  aria-label="Absolute grading class size"
                />
                <span className="small muted">students</span>
              </div>
              <p className="small muted">These rules are compiled from student guides and forum posts, not an official VIT document. Check your course handbook or faculty for the exact policy.</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function clampNum(raw: string, lo: number, hi: number, fallback: number): number {
  const v = Number(raw);
  return raw.trim() === "" || !Number.isFinite(v) ? fallback : Math.min(hi, Math.max(lo, v));
}

function RuleInputs({ values, step, onChange }: { values: Record<PassGrade, number>; step: number; onChange: (g: PassGrade, v: number) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 10px", alignItems: "center", maxWidth: 220 }}>
      {PASS_GRADES.map((g) => (
        <div key={g} style={{ display: "contents" }}>
          <GradeChip grade={g} />
          <input className="num-input" type="number" step={step} value={values[g]} onChange={(e) => onChange(g, clampNum(e.target.value, -10, 100, values[g]))} aria-label={`Cutoff for ${g}`} />
        </div>
      ))}
    </div>
  );
}
