import { useDeferredValue, useMemo } from "react";
import { FatOutlookChart, GradeProbabilityChart, GradeRangesChart } from "../components/charts/PredictorCharts";
import { Card, ChartCard, DataTable, GradeChip, PageHead, Segmented, SliderField, StatTile, type Column } from "../components/ui";
import { fmt, pct } from "../lib/format";
import { MODELS, predictFat, type ModelId } from "../lib/model";
import { createRng } from "../lib/random";
import { forecastStudent } from "../lib/simulation";
import { fatNeeded, internalMarks, PASS_GRADES, SCHEME, type PassGrade, type StudentRecord } from "../lib/vit";
import { DEFAULT_STUDENT, studentMarks, useApp, type StudentInput } from "../state/AppState";

const N_SIMS = 4000;
const TYPICAL_CLASS_SIZE = 64;

function typicalClass(records: readonly StudentRecord[]): StudentRecord[] {
  const rng = createRng(99);
  const pool = [...records];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, TYPICAL_CLASS_SIZE);
}

export default function Predictor() {
  const app = useApp();
  const { analysis, rules, student, setStudent, current, historical, classSource } = app;
  const deferred = useDeferredValue(student);

  const classmates = useMemo(
    () => (classSource === "current" && current ? current.records : typicalClass(historical.records)),
    [classSource, current, historical],
  );

  const forecast = useMemo(() => {
    if (!analysis) return null;
    const marks = studentMarks(deferred);
    return forecastStudent({
      fit: analysis.fit,
      target: predictFat(analysis.fit, analysis.spec, marks),
      targetInternal: internalMarks(marks),
      classmates: classmates.map((r) => predictFat(analysis.fit, analysis.spec, r)),
      classmateInternals: classmates.map(internalMarks),
      tau: analysis.tau,
      rules,
      nSims: N_SIMS,
    });
  }, [analysis, deferred, classmates, rules]);

  const set = (key: keyof StudentInput) => (v: number) => setStudent({ ...student, [key]: v });
  const marks = studentMarks(student);
  const internal = internalMarks(marks);

  return (
    <>
      <PageHead
        title="Predict your FAT & final grade"
        description="Enter your CAT and DA marks. The model learns from past students how internals relate to FAT, simulates your whole class's FAT results thousands of times, and applies VIT's relative grading to each run."
      />
      <div className="predictor-layout">
        <div className="sticky-side stack">
          <Card title="Your marks" subtitle="Raw marks as shown on VTOP">
            <SliderField label="CAT-1" hint="out of 50" value={student.cat1} min={0} max={50} step={0.5} onChange={set("cat1")} />
            <SliderField label="CAT-2" hint="out of 50" value={student.cat2} min={0} max={50} step={0.5} onChange={set("cat2")} />
            <SliderField label="DA-1 / Quiz-1" hint="out of 10" value={student.da1} min={0} max={10} step={0.5} onChange={set("da1")} />
            <SliderField label="DA-2 / Quiz-2" hint="out of 10" value={student.da2} min={0} max={10} step={0.5} onChange={set("da2")} />
            <SliderField label="DA-3 / Quiz-3" hint="out of 10" value={student.da3} min={0} max={10} step={0.5} onChange={set("da3")} />
            <div className="divider" />
            <dl className="kv">
              <dt>CAT-1 weighted</dt>
              <dd>{fmt(marks.cat1 * 0.3)} / 15</dd>
              <dt>CAT-2 weighted</dt>
              <dd>{fmt(marks.cat2 * 0.3)} / 15</dd>
              <dt>DA total</dt>
              <dd>{fmt(marks.da)} / 30</dd>
              <dt>
                <b style={{ color: "var(--ink)" }}>Internal marks</b>
              </dt>
              <dd>
                <b>{fmt(internal)} / 60</b>
              </dd>
            </dl>
            <div className="divider" />
            <div className="field">
              <span className="field-label">Grade against</span>
              <Segmented
                small
                value={classSource}
                onChange={app.setClassSource}
                options={[
                  ...(current ? [{ value: "current" as const, label: `Current class (${current.records.length})` }] : []),
                  { value: "typical" as const, label: "Typical past class" },
                ]}
              />
            </div>
            <div className="field">
              <span className="field-label">Prediction model</span>
              <select className="select" value={app.modelId} onChange={(e) => app.setModelId(e.target.value as ModelId)} aria-label="Prediction model">
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.short})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="button" onClick={() => setStudent(DEFAULT_STUDENT)}>
                Reset marks
              </button>
            </div>
          </Card>
        </div>

        {!forecast ? (
          <Card title="Model unavailable">
            <p className="notice">{app.analysisError ?? "Load past class data on the Data page."}</p>
          </Card>
        ) : (
          <div className="stack">
            <Card>
              <div className="hero">
                <GradeChip grade={forecast.mostLikely} size="lg" />
                <div>
                  <div className="hero-label">Most likely grade</div>
                  <div className="hero-value">
                    {forecast.mostLikely} grade · {pct(forecast.probs[forecast.mostLikely])} chance
                  </div>
                  <div className="hero-meta">
                    <span>
                      Expected grade point <b>{fmt(forecast.expectedGradePoint, 2)}</b>
                    </span>
                    <span>
                      {forecast.sim.method === "relative" ? "Relative" : "Absolute"} grading · class of <b>{forecast.sim.gradeCounts.length}</b>
                    </span>
                    <span>
                      <b>{N_SIMS.toLocaleString()}</b> simulated FATs
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid grid-4">
              <StatTile label="Predicted FAT" value={Math.round(forecast.fat.mean)} unit="/ 100" sub={`95% range ${Math.round(forecast.fat.piLow)}–${Math.round(forecast.fat.piHigh)}`} />
              <StatTile label="Expected total" value={fmt(forecast.total.mean)} unit="/ 100" sub={`95% range ${fmt(forecast.total.lo, 0)}–${fmt(forecast.total.hi, 0)}`} />
              <StatTile
                label="Chance of passing"
                value={pct(1 - forecast.probs.F)}
                sub={
                  forecast.probs.F > 0.15 ? (
                    <span className="status critical">▲ At risk — FAT min {rules.fatMinimum}</span>
                  ) : (
                    <span className="status good">✓ Comfortable</span>
                  )
                }
              />
              <StatTile label="Class average (expected)" value={fmt(forecast.classMean.mean)} unit="/ 100" sub={`SD ${fmt(forecast.classSd.mean)} marks`} />
            </div>

            <div className="grid grid-2">
              <ChartCard
                title="Grade probabilities"
                subtitle="Share of simulated runs ending in each grade"
                table={{
                  columns: [
                    { key: "grade", label: "Grade", render: (r: { grade: PassGrade | "F" }) => <GradeChip grade={r.grade} /> },
                    { key: "p", label: "Probability", num: true, render: (r: { p: number }) => pct(r.p, 1) },
                  ],
                  rows: (["S", "A", "B", "C", "D", "E", "F"] as const).map((g) => ({ grade: g, p: forecast.probs[g] })),
                }}
              >
                <GradeProbabilityChart forecast={forecast} />
              </ChartCard>
              <ChartCard
                title="Predicted grade ranges"
                subtitle="Expected cutoffs for this class; whiskers show 90% uncertainty, the bracket your own 95% range"
                table={{
                  columns: [
                    { key: "grade", label: "Grade", render: (r: { grade: PassGrade }) => <GradeChip grade={r.grade} /> },
                    { key: "rule", label: "Rule", render: (r: { grade: PassGrade }) => `μ ${rules.k[r.grade] >= 0 ? "+" : "−"} ${Math.abs(rules.k[r.grade])}σ` },
                    { key: "cut", label: "Cutoff", num: true, render: (r: { grade: PassGrade }) => fmt(forecast.cutoffs[r.grade].mean) },
                    { key: "range", label: "90% range", num: true, render: (r: { grade: PassGrade }) => `${fmt(forecast.cutoffs[r.grade].lo)}–${fmt(forecast.cutoffs[r.grade].hi)}` },
                  ],
                  rows: PASS_GRADES.map((g) => ({ grade: g })),
                }}
              >
                <GradeRangesChart forecast={forecast} />
                <div className="small ink-2" style={{ marginTop: 6 }}>
                  Class mean μ ≈ {fmt(forecast.classMean.mean)} ({fmt(forecast.classMean.lo)}–{fmt(forecast.classMean.hi)}), σ ≈ {fmt(forecast.classSd.mean)}. Cutoffs move with the whole class, so a tough FAT paper lowers them too.
                </div>
              </ChartCard>
            </div>

            <ChartCard
              title="FAT outlook"
              subtitle={`Where your FAT is likely to land (shaded: 95% prediction interval ${Math.round(forecast.fat.piLow)}–${Math.round(forecast.fat.piHigh)}) and the grade each score would earn. Hover to see grade odds at any score.`}
            >
              <FatOutlookChart forecast={forecast} df={analysis!.fit.df} rules={rules} />
            </ChartCard>

            <Card title="What you need in the FAT" subtitle="FAT score needed to reach each grade at the expected cutoffs, and how likely you are to get there">
              <DataTable<{ grade: PassGrade }>
                columns={needColumns(forecast, internal, rules)}
                rows={PASS_GRADES.map((g) => ({ grade: g }))}
                highlight={(r) => r.grade === forecast.mostLikely}
              />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function needColumns(forecast: NonNullable<ReturnType<typeof forecastStudent>>, internal: number, rules: ReturnType<typeof useApp>["rules"]): Column<{ grade: PassGrade }>[] {
  return [
    { key: "grade", label: "Grade", render: (r) => <GradeChip grade={r.grade} /> },
    { key: "cutoff", label: "Total needed", num: true, render: (r) => fmt(forecast.cutoffs[r.grade].mean) },
    {
      key: "fat",
      label: "FAT needed",
      num: true,
      render: (r) => {
        const need = fatNeeded(internal, forecast.cutoffs[r.grade].mean, rules);
        if (need > SCHEME.fat.max) return <span className="muted">Not reachable</span>;
        return `${Math.ceil(need)} / 100`;
      },
    },
    { key: "p", label: "Chance of this grade or better", num: true, render: (r) => pct(forecast.atLeast[r.grade]) },
  ];
}
