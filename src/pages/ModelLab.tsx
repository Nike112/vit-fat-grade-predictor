import { useMemo } from "react";
import { ConfusionMatrix, HistogramChart, ScatterFitChart } from "../components/charts/AnalyticsCharts";
import { Card, ChartCard, DataTable, PageHead, Segmented, StatTile } from "../components/ui";
import { backtestGrades } from "../lib/backtest";
import { fmt, pct, pValue } from "../lib/format";
import { MODELS, withFat, type ModelId } from "../lib/model";
import { histogram, qqPoints, summarize } from "../lib/stats";
import { GRADES } from "../lib/vit";
import { useApp } from "../state/AppState";

export default function ModelLab() {
  const { analysis, analysisError, historical, rules, modelId, setModelId } = useApp();

  const backtest = useMemo(() => (analysis ? backtestGrades(analysis.spec, historical.records, rules) : null), [analysis, historical, rules]);

  const diag = useMemo(() => {
    if (!analysis) return null;
    const { fit } = analysis;
    const rows = withFat(historical.records);
    const actualVsFitted = rows.map((r, i) => ({ x: fit.fitted[i], y: r.fat, id: r.id }));
    const resid = rows.map((r, i) => ({ x: fit.fitted[i], y: fit.residuals[i], id: r.id }));
    const qq = qqPoints(fit.residuals).map((p) => ({ x: p.theoretical, y: p.sample }));
    const rs = summarize(fit.residuals);
    const lim = Math.ceil(Math.max(Math.abs(rs.min), Math.abs(rs.max)) / 10) * 10;
    return { actualVsFitted, resid, qq, rs, lim, bins: histogram(fit.residuals, -lim, lim, 5) };
  }, [analysis, historical]);

  if (!analysis || !diag) {
    return (
      <>
        <PageHead title="Prediction model" />
        <p className="notice">{analysisError}</p>
      </>
    );
  }

  const { fit, spec, comparisons, tau } = analysis;
  const chosen = comparisons.find((c) => c.spec.id === spec.id)!;
  const equation = fit.names
    .map((name, j) => {
      const b = fit.coef[j];
      if (j === 0) return fmt(b, 2);
      return `${b >= 0 ? "+" : "−"} ${fmt(Math.abs(b), 3)}·${name}`;
    })
    .join(" ");

  return (
    <>
      <PageHead
        title="Prediction model"
        description="Ordinary least squares regression of FAT marks on internal marks, fitted to every past student. The same fit gives the prediction intervals used by the simulator."
        actions={<Segmented value={modelId} onChange={(v: ModelId) => setModelId(v)} options={MODELS.map((m) => ({ value: m.id, label: m.label }))} label="Model" />}
      />
      <div className="stack">
        <Card title={spec.label} subtitle={spec.description}>
          <div className="formula">FAT̂ = {equation}</div>
          <p className="small ink-2">
            Fitted on n = {fit.n} students, {fit.df} residual degrees of freedom. Section effect τ = {fmt(tau, 2)} FAT marks: the standard deviation of the shared “paper difficulty” shock between class sections, estimated from section-mean residuals.
          </p>
        </Card>

        <div className="grid grid-5">
          <StatTile label="R²" value={fmt(fit.r2, 3)} sub={`${pct(fit.r2)} of FAT variance explained`} />
          <StatTile label="Adjusted R²" value={fmt(fit.adjR2, 3)} sub={`AIC ${fmt(fit.aic, 1)}`} />
          <StatTile label="Residual SE (σ̂)" value={fmt(fit.sigma, 2)} unit="marks" sub="typical miss for one student" />
          <StatTile label="F-test" value={`F = ${fmt(fit.fStat, 1)}`} sub={`p ${pValue(fit.fPValue)}`} />
          <StatTile label="Out-of-sample RMSE" value={fmt(chosen.cvRmse, 2)} unit="marks" sub={chosen.cvMethod} />
        </div>

        <Card title="Coefficients" subtitle="Each coefficient is the change in predicted FAT for one extra mark in that component, holding the others fixed">
          <DataTable
            columns={[
              { key: "name", label: "Term" },
              { key: "b", label: "Estimate", num: true, render: (r) => fmt(r.b, 4) },
              { key: "se", label: "Std. error", num: true, render: (r) => fmt(r.se, 4) },
              { key: "t", label: "t", num: true, render: (r) => fmt(r.t, 2) },
              { key: "p", label: "p-value", num: true, render: (r) => pValue(r.p) },
              { key: "ci", label: "95% CI", num: true, render: (r) => `${fmt(r.lo, 3)} to ${fmt(r.hi, 3)}` },
            ]}
            rows={fit.names.map((name, j) => ({ name, b: fit.coef[j], se: fit.se[j], t: fit.tStat[j], p: fit.pValue[j], lo: fit.ciLow[j], hi: fit.ciHigh[j] }))}
          />
        </Card>

        <h2 className="section-title">Diagnostics</h2>
        <div className="grid grid-2">
          <ChartCard title="Actual vs predicted FAT" subtitle="Points on the diagonal are perfect predictions">
            <ScatterFitChart
              points={diag.actualVsFitted}
              line={[
                { x: 0, y: 0 },
                { x: 100, y: 100 },
              ]}
              lineLabel="y = x"
              xLabel="Predicted FAT"
              yLabel="Actual FAT"
              xDomain={[0, 100]}
            />
          </ChartCard>
          <ChartCard title="Residuals vs fitted" subtitle="No pattern or funnel shape ⇒ linearity and constant variance look reasonable">
            <ScatterFitChart
              points={diag.resid}
              line={[
                { x: 0, y: 0 },
                { x: 100, y: 0 },
              ]}
              lineLabel="0"
              xLabel="Predicted FAT"
              yLabel="Residual"
              xDomain={[0, 100]}
              yDomain={[-diag.lim, diag.lim]}
            />
          </ChartCard>
          <ChartCard title="Residual distribution" subtitle={`Mean ${fmt(diag.rs.mean, 2)}, SD ${fmt(diag.rs.sd, 2)}, skew ${fmt(diag.rs.skewness, 2)}, Jarque–Bera p ${pValue(diag.rs.jbPValue)}`}>
            <HistogramChart bins={diag.bins} xLabel="Residual (actual − predicted FAT)" height={300} />
          </ChartCard>
          <ChartCard title="Normal Q-Q plot of residuals" subtitle="Standardised residuals against normal quantiles; a straight line supports the normal-error assumption">
            <ScatterFitChart
              points={diag.qq}
              line={[
                { x: -3.5, y: -3.5 },
                { x: 3.5, y: 3.5 },
              ]}
              lineLabel="y = x"
              xLabel="Theoretical quantile"
              yLabel="Sample quantile"
              xDomain={[-3.5, 3.5]}
              yDomain={[-4, 4]}
            />
          </ChartCard>
        </div>

        <h2 className="section-title">Does it predict grades?</h2>
        {backtest ? (
          <>
            <div className="grid grid-4">
              <StatTile label="Exact grade correct" value={pct(backtest.exactAccuracy)} sub={`vs ${pct(backtest.baselineAccuracy)} always guessing ${backtest.baselineGrade}`} />
              <StatTile label="Within one grade" value={pct(backtest.withinOne)} sub={`${backtest.n} students, ${backtest.sections} sections`} />
              <StatTile label="Avg. probability on true grade" value={pct(backtest.meanProbActual)} sub="higher = sharper, honest forecasts" />
              <StatTile label="FAT error (held-out)" value={fmt(backtest.fatMae, 1)} unit="marks MAE" sub={`RMSE ${fmt(backtest.fatRmse, 1)}`} />
            </div>
            <Card
              title="Confusion matrix — leave-one-section-out backtest"
              subtitle="Each section was hidden, the model was refitted on the others, and its most likely grade compared with the actual grade. Shading is the share of each row."
            >
              <ConfusionMatrix matrix={backtest.confusion} />
            </Card>
          </>
        ) : (
          <p className="notice">The backtest needs at least two sections in the past-class data.</p>
        )}

        <Card title="Model comparison" subtitle="Lower AIC and lower out-of-sample error are better. Click a model at the top to switch.">
          <DataTable
            columns={[
              { key: "label", label: "Model", render: (c) => c.spec.label },
              { key: "pred", label: "Predictors", render: (c) => c.spec.short },
              { key: "r2", label: "R²", num: true, render: (c) => fmt(c.fit.r2, 3) },
              { key: "adj", label: "Adj. R²", num: true, render: (c) => fmt(c.fit.adjR2, 3) },
              { key: "aic", label: "AIC", num: true, render: (c) => fmt(c.fit.aic, 1) },
              { key: "rmse", label: "CV RMSE", num: true, render: (c) => fmt(c.cvRmse, 2) },
              { key: "mae", label: "CV MAE", num: true, render: (c) => fmt(c.cvMae, 2) },
            ]}
            rows={comparisons}
            highlight={(c) => c.spec.id === spec.id}
          />
          <p className="card-foot">Grades in this backtest use the grading rules currently set on the Grading rules page ({GRADES.length} grades, FAT minimum {rules.enforceFatMinimum ? `${rules.fatMinimum}` : "off"}).</p>
        </Card>
      </div>
    </>
  );
}
