import { useMemo, useState } from "react";
import { CorrelationHeatmap, GradeDistributionChart, HistogramChart, ScatterFitChart, SectionMeansChart } from "../components/charts/AnalyticsCharts";
import { Card, ChartCard, DataTable, Legend, PageHead, Segmented, StatTile } from "../components/ui";
import { normalCdf, tInv } from "../lib/distributions";
import { fmt, pct, pValue } from "../lib/format";
import { predictFat } from "../lib/model";
import { fitOLS } from "../lib/regression";
import { histogram, mean, pearson, sd, summarize } from "../lib/stats";
import { GRADES, internalMarks, PASS_GRADES, type Grade } from "../lib/vit";
import { studentMarks, useApp, type GradedRecord } from "../state/AppState";

type XVar = "internal" | "cat1" | "cat2" | "da";

const COMPONENTS = [
  { key: "cat1", label: "CAT-1", max: 50, bin: 5, get: (r: GradedRecord) => r.cat1 },
  { key: "cat2", label: "CAT-2", max: 50, bin: 5, get: (r: GradedRecord) => r.cat2 },
  { key: "da", label: "DA total", max: 30, bin: 2, get: (r: GradedRecord) => r.da },
  { key: "internal", label: "Internal", max: 60, bin: 5, get: (r: GradedRecord) => r.internal },
  { key: "fat", label: "FAT", max: 100, bin: 10, get: (r: GradedRecord) => r.fat },
  { key: "total", label: "Total", max: 100, bin: 5, get: (r: GradedRecord) => r.total },
] as const;

const X_VARS: Record<XVar, { label: string; max: number }> = {
  internal: { label: "Internal (/60)", max: 60 },
  cat1: { label: "CAT-1 (/50)", max: 50 },
  cat2: { label: "CAT-2 (/50)", max: 50 },
  da: { label: "DA total (/30)", max: 30 },
};

export default function Analytics() {
  const { analysis, analysisError, chart, rules, student } = useApp();
  const [picked, setSection] = useState<string>("all");
  // Fall back to all sections if the chosen one disappears after a data upload.
  const section = analysis?.sections.includes(picked) ? picked : "all";
  const [xVar, setXVar] = useState<XVar>("internal");

  const rows = useMemo(() => (analysis ? analysis.graded.filter((r) => section === "all" || r.section === section) : []), [analysis, section]);

  const derived = useMemo(() => {
    if (rows.length < 3) return null;
    const summaries = COMPONENTS.map((c) => ({ ...c, values: rows.map(c.get) })).map((c) => ({ ...c, s: summarize(c.values) }));
    const corrNames = COMPONENTS.map((c) => c.label);
    const corr = summaries.map((a) => summaries.map((b) => pearson(a.values, b.values)));

    const observed = Object.fromEntries(GRADES.map((g) => [g, rows.filter((r) => r.grade === g).length / rows.length])) as Record<Grade, number>;
    const theory = {} as Record<Grade, number>;
    let upper = 1;
    for (const g of PASS_GRADES) {
      const p = 1 - normalCdf(rules.k[g]);
      theory[g] = p - (1 - upper);
      upper = 1 - p;
    }
    theory.F = 1 - PASS_GRADES.reduce((s, g) => s + theory[g], 0);

    const bySection = [...new Set(rows.map((r) => r.section))].map((s) => {
      const fats = rows.filter((r) => r.section === s).map((r) => r.fat);
      return { section: s, mean: mean(fats), half: tInv(0.975, fats.length - 1) * (sd(fats) / Math.sqrt(fats.length)), n: fats.length };
    });
    return { summaries, corrNames, corr, observed, theory, bySection };
  }, [rows, rules]);

  const scatter = useMemo(() => {
    if (!analysis || rows.length < 3) return null;
    const getX = (r: { cat1: number; cat2: number; da: number }) => (xVar === "internal" ? internalMarks(r) : r[xVar]);
    const points = rows.map((r) => ({ x: getX(r), y: r.fat, id: r.id }));
    const fit = fitOLS(
      points.map((p) => [p.x]),
      points.map((p) => p.y),
      [xVar],
    );
    const xs = points.map((p) => p.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const line = [lo, hi].map((x) => ({ x, y: fit.coef[0] + fit.coef[1] * x }));
    const marks = studentMarks(student);
    const you = { x: getX(marks), y: predictFat(analysis.fit, analysis.spec, marks).mean };
    return { points, line, you, fit, r: pearson(xs, points.map((p) => p.y)) };
  }, [analysis, rows, xVar, student]);

  if (!analysis || !derived) {
    return (
      <>
        <PageHead title="Class analytics" />
        <p className="notice">{analysisError ?? "Not enough data in this section."}</p>
      </>
    );
  }

  const fat = derived.summaries.find((s) => s.key === "fat")!.s;
  const total = derived.summaries.find((s) => s.key === "total")!.s;
  const passRate = rows.filter((r) => r.fat >= rules.fatMinimum).length / rows.length;
  const rInternal = pearson(
    rows.map((r) => r.internal),
    rows.map((r) => r.fat),
  );

  return (
    <>
      <PageHead title="Class analytics" description="Exploratory analysis of past classes — the data the prediction model learns from. All charts follow the section filter." />
      <div className="stack">
        <div className="filter-bar">
          <span className="label">Section</span>
          <select className="select" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section filter">
            <option value="all">All sections ({analysis.graded.length} students)</option>
            {analysis.sections.map((s) => (
              <option key={s} value={s}>
                {s} ({analysis.graded.filter((r) => r.section === s).length})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-5">
          <StatTile label="Students" value={rows.length} sub={section === "all" ? `${analysis.sections.length} sections` : section} />
          <StatTile label="Average FAT" value={fmt(fat.mean)} unit="/ 100" sub={`SD ${fmt(fat.sd)}`} />
          <StatTile label={`FAT ≥ ${rules.fatMinimum} (pass)`} value={pct(passRate)} sub={`${rows.length - Math.round(passRate * rows.length)} below minimum`} />
          <StatTile label="Average total" value={fmt(total.mean)} unit="/ 100" sub={`SD ${fmt(total.sd)}`} />
          <StatTile label="Internal ↔ FAT correlation" value={`r = ${rInternal.toFixed(2)}`} sub={`r² = ${pct(rInternal ** 2)} of FAT variance`} />
        </div>

        <h2 className="section-title">Distributions</h2>
        <Legend
          items={[
            { label: "Students per bin", color: chart.series[0] },
            { label: "Normal distribution fitted to the same mean & SD", color: chart.series[1], kind: "line" },
          ]}
        />
        <div className="grid grid-3">
          {derived.summaries.map((c) => (
            <ChartCard
              key={c.key}
              title={c.label}
              subtitle={`x̄ = ${fmt(c.s.mean)}, s = ${fmt(c.s.sd)}, skew ${fmt(c.s.skewness, 2)}`}
              table={{
                columns: [
                  { key: "range", label: "Range", render: (b: { x0: number; x1: number }) => `${fmt(b.x0, 0)}–${fmt(b.x1, 0)}` },
                  { key: "count", label: "Students", num: true },
                  { key: "expected", label: "Normal fit", num: true, render: (b: { expected: number }) => fmt(b.expected) },
                ],
                rows: histogram(c.values, 0, c.max, c.bin),
              }}
            >
              <HistogramChart bins={histogram(c.values, 0, c.max, c.bin)} xLabel={`Marks (out of ${c.max})`} />
            </ChartCard>
          ))}
        </div>

        <Card title="Descriptive statistics" subtitle="Jarque–Bera tests whether skewness and kurtosis are consistent with a normal distribution (small p ⇒ not normal)">
          <DataTable
            columns={[
              { key: "label", label: "Component" },
              { key: "n", label: "n", num: true, render: (r) => r.s.n },
              { key: "mean", label: "Mean", num: true, render: (r) => fmt(r.s.mean, 2) },
              { key: "sd", label: "SD", num: true, render: (r) => fmt(r.s.sd, 2) },
              { key: "min", label: "Min", num: true, render: (r) => fmt(r.s.min) },
              { key: "q1", label: "Q1", num: true, render: (r) => fmt(r.s.q1) },
              { key: "median", label: "Median", num: true, render: (r) => fmt(r.s.median) },
              { key: "q3", label: "Q3", num: true, render: (r) => fmt(r.s.q3) },
              { key: "max", label: "Max", num: true, render: (r) => fmt(r.s.max) },
              { key: "skew", label: "Skewness", num: true, render: (r) => fmt(r.s.skewness, 2) },
              { key: "kurt", label: "Excess kurtosis", num: true, render: (r) => fmt(r.s.kurtosis, 2) },
              { key: "jb", label: "JB p-value", num: true, render: (r) => pValue(r.s.jbPValue) },
            ]}
            rows={derived.summaries}
          />
        </Card>

        <h2 className="section-title">Relationships</h2>
        <div className="grid grid-2">
          <Card title="Correlation matrix" subtitle="Pearson r between every pair of components. CATs carry most of the information about FAT.">
            <CorrelationHeatmap names={derived.corrNames} matrix={derived.corr} />
          </Card>
          <ChartCard
            title={`FAT vs ${X_VARS[xVar].label}`}
            subtitle={scatter ? `r = ${scatter.r.toFixed(3)} · fitted line FAT = ${fmt(scatter.fit.coef[0], 2)} + ${fmt(scatter.fit.coef[1], 3)}·x · orange = you` : undefined}
            extra={
              <Segmented
                small
                value={xVar}
                onChange={setXVar}
                options={[
                  { value: "internal", label: "Internal" },
                  { value: "cat1", label: "CAT-1" },
                  { value: "cat2", label: "CAT-2" },
                  { value: "da", label: "DA" },
                ]}
              />
            }
            table={
              scatter
                ? {
                    columns: [
                      { key: "id", label: "Student" },
                      { key: "x", label: X_VARS[xVar].label, num: true, render: (p: { x: number }) => fmt(p.x) },
                      { key: "y", label: "FAT", num: true },
                    ],
                    rows: scatter.points,
                  }
                : undefined
            }
          >
            {scatter && <ScatterFitChart points={scatter.points} line={scatter.line} you={scatter.you} xLabel={X_VARS[xVar].label} yLabel="FAT (/100)" xDomain={[0, X_VARS[xVar].max]} lineLabel="Least-squares fit" />}
          </ChartCard>
        </div>

        <h2 className="section-title">Grades</h2>
        <div className="grid grid-2">
          <ChartCard
            title="Grade distribution vs normal theory"
            subtitle="If totals were exactly normal, relative grading would hand out these shares. The FAT minimum adds extra F grades."
            table={{
              columns: [
                { key: "grade", label: "Grade" },
                { key: "observed", label: "Observed", num: true, render: (r: { observed: number }) => pct(r.observed, 1) },
                { key: "theory", label: "Normal theory", num: true, render: (r: { theory: number }) => pct(r.theory, 1) },
              ],
              rows: GRADES.map((g) => ({ grade: g, observed: derived.observed[g], theory: derived.theory[g] })),
            }}
          >
            <Legend
              items={[
                { label: "Observed", color: chart.series[0] },
                { label: "Normal theory", color: chart.series[1] },
              ]}
            />
            <GradeDistributionChart observed={derived.observed} theory={derived.theory} />
          </ChartCard>
          <ChartCard
            title="Average FAT by section"
            subtitle={`Dots are means, whiskers 95% confidence intervals (t-distribution); the line is the overall mean ${fmt(fat.mean)}. Gaps between sections reflect paper difficulty.`}
            table={{
              columns: [
                { key: "section", label: "Section" },
                { key: "n", label: "n", num: true },
                { key: "mean", label: "Mean FAT", num: true, render: (r: { mean: number }) => fmt(r.mean) },
                { key: "ci", label: "95% CI", num: true, render: (r: { mean: number; half: number }) => `${fmt(r.mean - r.half)}–${fmt(r.mean + r.half)}` },
              ],
              rows: derived.bySection,
            }}
          >
            <SectionMeansChart rows={derived.bySection} overall={fat.mean} />
          </ChartCard>
        </div>
      </div>
    </>
  );
}
