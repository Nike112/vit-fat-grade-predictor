import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import { fmt, pct } from "../../lib/format";
import type { HistogramBin } from "../../lib/stats";
import { GRADES, type Grade } from "../../lib/vit";
import { useApp } from "../../state/AppState";
import { divergingAt, inkOn, rampAt } from "../../theme";
import { TooltipBox } from "../ui";
import { axisLabel, axisProps, gridProps } from "./common";

// ---------------------------------------------------------------- histogram + normal fit

export function HistogramChart({ bins, xLabel, height = 200 }: { bins: HistogramBin[]; xLabel: string; height?: number }) {
  const { chart } = useApp();
  const data = bins.map((b) => ({ ...b, label: `${fmt(b.x0, 0)}–${fmt(b.x1, 0)}` }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 16, left: 0 }} barCategoryGap={2}>
        <CartesianGrid {...gridProps(chart)} />
        <XAxis dataKey="label" {...axisProps(chart)} interval="preserveStartEnd" tickFormatter={(l: string) => l.split("–")[0]} label={axisLabel(chart, xLabel, "x")} />
        <YAxis {...axisProps(chart)} width={34} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: chart.grid, opacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={`${payload[0].payload.label} marks`}
                rows={[
                  { label: "Students", value: payload[0].payload.count, color: chart.series[0] },
                  { label: "Normal fit", value: fmt(payload[0].payload.expected), color: chart.series[1] },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="count" fill={chart.series[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line dataKey="expected" type="monotone" stroke={chart.series[1]} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- scatter with regression line

export interface ScatterPoint {
  x: number;
  y: number;
  id?: string;
}

export function ScatterFitChart({
  points,
  line,
  you,
  xLabel,
  yLabel,
  xDomain,
  yDomain = [0, 100],
  height = 300,
  lineLabel = "Fit",
}: {
  points: ScatterPoint[];
  line?: { x: number; y: number }[];
  you?: ScatterPoint | null;
  xLabel: string;
  yLabel: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  height?: number;
  lineLabel?: string;
}) {
  const { chart } = useApp();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart margin={{ top: 10, right: 16, bottom: 18, left: 6 }}>
        <CartesianGrid {...gridProps(chart)} vertical />
        <XAxis dataKey="x" type="number" domain={xDomain ?? ["auto", "auto"]} {...axisProps(chart)} label={axisLabel(chart, xLabel, "x")} allowDecimals={false} />
        <YAxis dataKey="y" type="number" domain={yDomain} {...axisProps(chart)} width={44} label={axisLabel(chart, yLabel, "y")} />
        <Tooltip
          cursor={{ stroke: chart.axis }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as ScatterPoint & { you?: boolean };
            return <TooltipBox title={p.you ? "You (predicted)" : (p.id ?? "Student")} rows={[{ label: xLabel, value: fmt(p.x) }, { label: yLabel, value: fmt(p.y) }]} />;
          }}
        />
        <Scatter data={points} fill={chart.series[0]} fillOpacity={0.55} isAnimationActive={false} shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={3.5} fill={chart.series[0]} fillOpacity={0.55} />} />
        {line && (
          <Line
            data={line}
            dataKey="y"
            stroke={chart.ink2}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            tooltipType="none"
            label={(props: { x?: number | string; y?: number | string; index?: number }) =>
              props.index === line.length - 1 ? (
                <text x={Number(props.x ?? 0) - 6} y={Number(props.y ?? 0) + 16} textAnchor="end" fill={chart.ink2} fontSize={12} fontWeight={600}>
                  {lineLabel}
                </text>
              ) : (
                <g />
              )
            }
          />
        )}
        {you && (
          <Scatter
            data={[{ ...you, you: true }]}
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number }) => (
              <g>
                <circle cx={props.cx} cy={props.cy} r={7} fill={chart.series[1]} stroke={chart.surface} strokeWidth={2} />
                <text x={(props.cx ?? 0) + 11} y={(props.cy ?? 0) + 4} fill={chart.ink} fontSize={12.5} fontWeight={650}>
                  You
                </text>
              </g>
            )}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- correlation heatmap

export function CorrelationHeatmap({ names, matrix }: { names: string[]; matrix: number[][] }) {
  const { chart } = useApp();
  const n = names.length;
  return (
    <div className="table-wrap">
      <div style={{ display: "grid", gridTemplateColumns: `84px repeat(${n}, minmax(48px, 1fr))`, gap: 2, minWidth: 84 + n * 50 }}>
        <div />
        {names.map((nm) => (
          <div key={nm} className="small ink-2" style={{ textAlign: "center", padding: "2px 0", fontWeight: 560 }}>
            {nm}
          </div>
        ))}
        {matrix.map((row, i) => (
          <div key={names[i]} style={{ display: "contents" }}>
            <div className="small ink-2" style={{ display: "flex", alignItems: "center", fontWeight: 560 }}>
              {names[i]}
            </div>
            {row.map((r, j) => {
              const bg = divergingAt(chart, r);
              return (
                <div
                  key={j}
                  title={`${names[i]} vs ${names[j]}: r = ${r.toFixed(3)}`}
                  style={{
                    background: bg,
                    color: inkOn(bg),
                    borderRadius: 6,
                    height: 40,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 13,
                    fontWeight: i === j ? 400 : 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {r.toFixed(2)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="legend" style={{ marginTop: 10, alignItems: "center" }}>
        <span>−1</span>
        <span style={{ display: "inline-flex", gap: 2 }}>
          {[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((v) => (
            <span key={v} className="swatch" style={{ width: 22, height: 10, background: divergingAt(chart, v) }} />
          ))}
        </span>
        <span>+1 &nbsp;Pearson r</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- observed vs theoretical grade shares

export function GradeDistributionChart({ observed, theory }: { observed: Record<Grade, number>; theory: Record<Grade, number> }) {
  const { chart } = useApp();
  const data = GRADES.map((g) => ({ grade: g, observed: observed[g], theory: theory[g] }));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid {...gridProps(chart)} />
        <XAxis dataKey="grade" {...axisProps(chart)} tick={{ fill: chart.ink2, fontSize: 13, fontWeight: 600 }} />
        <YAxis {...axisProps(chart)} width={40} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
        <Tooltip
          cursor={{ fill: chart.grid, opacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={`Grade ${payload[0].payload.grade}`}
                rows={[
                  { label: "Observed", value: pct(payload[0].payload.observed, 1), color: chart.series[0] },
                  { label: "Normal theory", value: pct(payload[0].payload.theory, 1), color: chart.series[1] },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="observed" name="Observed" fill={chart.series[0]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Bar dataKey="theory" name="Normal theory" fill={chart.series[1]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- section means with confidence intervals

interface SectionRow {
  section: string;
  mean: number;
  half: number;
  n: number;
}

export function SectionMeansChart({ rows, overall }: { rows: SectionRow[]; overall: number }) {
  const { chart } = useApp();
  // A floating bar spanning [lo, hi] draws the whisker; a dot marks the mean.
  const data = rows.map((r) => ({ ...r, ci: [r.mean - r.half, r.mean + r.half] as [number, number] }));
  const lo = Math.floor(Math.min(...data.map((d) => d.ci[0])) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...data.map((d) => d.ci[1])) / 5) * 5 + 5;
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid {...gridProps(chart)} />
        <XAxis dataKey="section" type="category" {...axisProps(chart)} interval={0} tick={{ fill: chart.muted, fontSize: 11 }} />
        <YAxis {...axisProps(chart)} width={40} domain={[lo, hi]} ticks={Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5)} />
        <Tooltip
          cursor={{ fill: chart.grid, opacity: 0.4 }}
          content={({ active, payload }) => {
            const r = active ? (payload?.[0]?.payload as SectionRow | undefined) : undefined;
            if (!r) return null;
            return <TooltipBox title={r.section} rows={[{ label: "Mean FAT", value: fmt(r.mean) }, { label: "95% CI", value: `${fmt(r.mean - r.half)}–${fmt(r.mean + r.half)}` }, { label: "Students", value: r.n }]} />;
          }}
        />
        <ReferenceLine y={overall} stroke={chart.ink2} strokeWidth={1} />
        <Bar
          dataKey="ci"
          barSize={12}
          isAnimationActive={false}
          shape={(p: BarShapeProps) => {
            const { x, y, width, height } = p as unknown as { x: number; y: number; width: number; height: number };
            const cx = x + width / 2;
            return (
              <g stroke={chart.series[0]} strokeWidth={2} strokeLinecap="round">
                <line x1={cx} x2={cx} y1={y} y2={y + height} />
                <line x1={x} x2={x + width} y1={y} y2={y} />
                <line x1={x} x2={x + width} y1={y + height} y2={y + height} />
              </g>
            );
          }}
        />
        <Scatter dataKey="mean" isAnimationActive={false} shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={5} fill={chart.series[0]} stroke={chart.surface} strokeWidth={2} />} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- confusion matrix

export function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const { chart } = useApp();
  const n = GRADES.length;
  return (
    <div className="table-wrap">
      <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${n}, minmax(38px, 1fr))`, gap: 2, minWidth: 64 + n * 40 }}>
        <div className="small muted" style={{ alignSelf: "end", lineHeight: 1.2 }}>
          actual ↓<br />predicted →
        </div>
        {GRADES.map((g) => (
          <div key={g} className="small ink-2" style={{ textAlign: "center", fontWeight: 650 }}>
            {g}
          </div>
        ))}
        {matrix.map((row, i) => {
          const rowTotal = row.reduce((a, b) => a + b, 0);
          return (
            <div key={GRADES[i]} style={{ display: "contents" }}>
              <div className="small ink-2" style={{ display: "flex", alignItems: "center", fontWeight: 650 }}>
                {GRADES[i]} <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>({rowTotal})</span>
              </div>
              {row.map((v, j) => {
                const share = rowTotal ? v / rowTotal : 0;
                const bg = v === 0 ? chart.sequential[0] : rampAt(chart.sequential.slice(1), share);
                return (
                  <div
                    key={j}
                    title={`Actual ${GRADES[i]}, predicted ${GRADES[j]}: ${v} students (${pct(share)} of row)`}
                    style={{
                      background: bg,
                      color: v === 0 ? chart.muted : inkOn(bg),
                      height: 36,
                      borderRadius: 6,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      fontWeight: i === j ? 700 : 500,
                      outline: i === j ? `2px solid ${chart.ink2}` : undefined,
                      outlineOffset: -2,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {v}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
