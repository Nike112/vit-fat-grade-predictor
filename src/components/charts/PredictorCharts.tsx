import { useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tPdf } from "../../lib/distributions";
import { fmt, pct } from "../../lib/format";
import type { StudentForecast } from "../../lib/simulation";
import { FAT_FACTOR, GRADES, PASS_GRADES, type Grade, type GradingRules } from "../../lib/vit";
import { useApp } from "../../state/AppState";
import { inkOn } from "../../theme";
import { TooltipBox } from "../ui";
import { axisLabel, axisProps, colouredBar, gridProps } from "./common";

// ---------------------------------------------------------------- grade probabilities

export function GradeProbabilityChart({ forecast }: { forecast: StudentForecast }) {
  const { chart } = useApp();
  const data = GRADES.map((g) => ({ grade: g, p: forecast.probs[g] }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 22, right: 8, bottom: 4, left: 0 }} barCategoryGap="30%">
        <CartesianGrid {...gridProps(chart)} />
        <XAxis dataKey="grade" {...axisProps(chart)} tick={{ fill: chart.ink2, fontSize: 13, fontWeight: 600 }} />
        <YAxis {...axisProps(chart)} width={44} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} domain={[0, (max: number) => Math.min(1, Math.ceil((max + 0.05) * 10) / 10)]} />
        <Tooltip
          cursor={{ fill: chart.grid, opacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? <TooltipBox title={`Grade ${payload[0].payload.grade}`} rows={[{ label: "Probability", value: pct(payload[0].payload.p, 1) }]} /> : null
          }
        />
        <Bar dataKey="p" maxBarSize={24} isAnimationActive={false} shape={colouredBar((d) => chart.grade[d.grade as Grade])}>
          <LabelList
            dataKey="p"
            position="top"
            content={(props) => {
              const { x, y, width, value, index } = props as { x: number; y: number; width: number; value: number; index: number };
              if (data[index].grade !== forecast.mostLikely) return null;
              return (
                <text x={x + width / 2} y={y - 6} textAnchor="middle" fill={chart.ink} fontSize={12.5} fontWeight={600}>
                  {pct(value)}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- FAT outlook + grade strip

interface FatPoint {
  fat: number;
  density: number;
  total: number;
  probs: Record<Grade, number>;
  best: Grade;
}

function bestGrade(p: Record<Grade, number>): Grade {
  return GRADES.reduce((b, g) => (p[g] > p[b] ? g : b), GRADES[0]);
}

const Y_AXIS_WIDTH = 44;

export function FatOutlookChart({ forecast, df, rules }: { forecast: StudentForecast; df: number; rules: GradingRules }) {
  const { chart } = useApp();
  const { mean: m, sePred: s } = forecast.fat;

  const data: FatPoint[] = useMemo(
    () =>
      forecast.gradeMap.map(({ fat, probs }) => ({
        fat,
        density: (tPdf((fat - m) / s, df) / s) * 100,
        total: forecast.internal + FAT_FACTOR * fat,
        probs,
        best: bestGrade(probs),
      })),
    [forecast, m, s, df],
  );

  // Contiguous runs of the most likely grade → strip segments.
  const segments = useMemo(() => {
    const out: { grade: Grade; from: number; to: number }[] = [];
    for (const d of data) {
      const last = out[out.length - 1];
      if (last && last.grade === d.best) last.to = d.fat;
      else out.push({ grade: d.best, from: d.fat, to: d.fat });
    }
    return out;
  }, [data]);

  // FAT needed for each grade, at the expected cutoffs.
  const thresholds = PASS_GRADES.map((g) => ({ grade: g, fat: (forecast.cutoffs[g].mean - forecast.internal) / FAT_FACTOR })).filter(
    (t) => t.fat > (rules.enforceFatMinimum ? rules.fatMinimum + 1 : 1) && t.fat <= 100,
  );

  const tooltip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: FatPoint }[] }) => {
    const d = active ? payload?.[0]?.payload : undefined;
    if (!d) return null;
    const rows = GRADES.filter((g) => d.probs[g] >= 0.01).map((g) => ({ label: `Grade ${g}`, value: pct(d.probs[g]), color: chart.grade[g] }));
    return <TooltipBox title={`If you score ${d.fat} in FAT`} rows={[{ label: "Total", value: `${fmt(d.total)} / 100` }, ...rows]} />;
  };

  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  return (
    <div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={data} margin={{ top: 22, right: 14, bottom: 0, left: 0 }} syncId="fat-outlook">
          <CartesianGrid {...gridProps(chart)} />
          <XAxis dataKey="fat" type="number" domain={[0, 100]} ticks={ticks} {...axisProps(chart)} tick={false} height={4} />
          <YAxis {...axisProps(chart)} width={Y_AXIS_WIDTH} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
          <Tooltip content={tooltip} cursor={{ stroke: chart.axis }} />
          <ReferenceArea x1={forecast.fat.piLow} x2={forecast.fat.piHigh} fill={chart.series[0]} fillOpacity={0.06} ifOverflow="hidden" />
          {thresholds.map((t) => (
            <ReferenceLine
              key={t.grade}
              x={t.fat}
              stroke={chart.axis}
              strokeWidth={1}
              label={{ value: t.grade, position: "top", fill: chart.ink2, fontSize: 12, fontWeight: 650 }}
            />
          ))}
          {rules.enforceFatMinimum && (
            <ReferenceLine x={rules.fatMinimum} stroke={chart.critical} strokeWidth={1} label={{ value: `FAT min ${rules.fatMinimum}`, position: "insideBottomLeft", fill: chart.ink2, fontSize: 11.5 }} />
          )}
          <Area type="monotone" dataKey="density" stroke={chart.series[0]} strokeWidth={2} fill={chart.series[0]} fillOpacity={0.12} isAnimationActive={false} activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }} />
          <ReferenceDot x={Math.round(m)} y={(tPdf((Math.round(m) - m) / s, df) / s) * 100} r={5} fill={chart.series[0]} stroke={chart.surface} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={64}>
        <ComposedChart data={data} margin={{ top: 4, right: 14, bottom: 4, left: 0 }} syncId="fat-outlook">
          <XAxis dataKey="fat" type="number" domain={[0, 100]} ticks={ticks} {...axisProps(chart)} />
          <YAxis width={Y_AXIS_WIDTH} domain={[0, 1]} tick={false} axisLine={false} tickLine={false} />
          {/* synced with the chart above, which shows the tooltip; here only the cursor */}
          <Tooltip content={() => null} cursor={{ stroke: chart.ink, strokeWidth: 1 }} />
          {segments.map((seg) => {
            const fill = chart.grade[seg.grade];
            const wide = seg.to - seg.from >= 3;
            return (
              <ReferenceArea
                key={`${seg.grade}-${seg.from}`}
                x1={Math.max(0, seg.from - 0.5)}
                x2={Math.min(100, seg.to + 0.5)}
                y1={0}
                y2={1}
                fill={fill}
                fillOpacity={1}
                stroke={chart.surface}
                strokeWidth={2}
                label={wide ? { value: seg.grade, fill: inkOn(fill), fontSize: 13, fontWeight: 700 } : undefined}
              />
            );
          })}
          {/* invisible series so the shared tooltip has data to show */}
          <Area dataKey={() => 0.5} stroke="none" fill="none" isAnimationActive={false} activeDot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="small muted" style={{ textAlign: "center", marginTop: -2 }}>
        FAT score (out of 100) — the strip shows the most likely grade at each score
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- predicted grade ranges

export function GradeRangesChart({ forecast }: { forecast: StudentForecast }) {
  const { chart } = useApp();
  const c = forecast.cutoffs;
  const lo = Math.max(0, Math.floor(Math.min(c.E.lo, forecast.total.lo) / 5) * 5 - 5);
  const bounds: { grade: Grade; from: number; to: number }[] = [];
  const order: Grade[] = ["F", "E", "D", "C", "B", "A", "S"];
  order.forEach((g, i) => {
    const from = g === "F" ? lo : c[g as Exclude<Grade, "F">].mean;
    const nextG = order[i + 1] as Exclude<Grade, "F"> | undefined;
    const to = nextG ? c[nextG].mean : 100;
    bounds.push({ grade: g, from: Math.max(lo, from), to: Math.min(100, to) });
  });
  const visible = bounds.filter((b) => b.to > b.from);
  const you = forecast.total;

  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={[{ x: lo }, { x: 100 }]} margin={{ top: 8, right: 18, bottom: 18, left: 18 }}>
        <XAxis
          dataKey="x"
          type="number"
          domain={[lo, 100]}
          {...axisProps(chart)}
          ticks={Array.from({ length: Math.floor((100 - lo) / 10) + 1 }, (_, i) => 100 - (Math.floor((100 - lo) / 10) - i) * 10)}
          label={axisLabel(chart, "Total marks (out of 100)", "x")}
        />
        <YAxis hide domain={[0, 1]} />
        {/* invisible series: Recharts only draws reference marks when the chart has a graphical item */}
        <Line dataKey={() => 0} stroke="none" dot={false} activeDot={false} isAnimationActive={false} />
        {visible.map((b) => {
          const fill = chart.grade[b.grade];
          return (
            <ReferenceArea
              key={b.grade}
              x1={b.from}
              x2={b.to}
              y1={0.3}
              y2={0.66}
              fill={fill}
              fillOpacity={1}
              stroke={chart.surface}
              strokeWidth={2}
              ifOverflow="hidden"
              label={b.to - b.from > 2.5 ? { value: b.grade, fill: inkOn(fill), fontSize: 13, fontWeight: 700 } : undefined}
            />
          );
        })}
        {PASS_GRADES.map((g) =>
          c[g].lo >= lo ? (
            <ReferenceLine
              key={g}
              segment={[
                { x: c[g].lo, y: 0.2 },
                { x: c[g].hi, y: 0.2 },
              ]}
              stroke={chart.ink2}
              strokeWidth={1.5}
              ifOverflow="hidden"
            />
          ) : null,
        )}
        <ReferenceLine
          segment={[
            { x: you.lo, y: 0.82 },
            { x: you.hi, y: 0.82 },
          ]}
          stroke={chart.ink}
          strokeWidth={2}
        />
        <ReferenceLine
          segment={[
            { x: you.mean, y: 0.26 },
            { x: you.mean, y: 0.82 },
          ]}
          stroke={chart.ink}
          strokeWidth={2}
        />
        <ReferenceDot x={you.mean} y={0.82} r={5} fill={chart.ink} stroke={chart.surface} strokeWidth={2} label={{ value: `You · ${fmt(you.mean)}`, position: "top", fill: chart.ink, fontSize: 12, fontWeight: 600 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
