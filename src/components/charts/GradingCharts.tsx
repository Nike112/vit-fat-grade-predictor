import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "../../lib/format";
import { PASS_GRADES, type Cutoffs, type Grade } from "../../lib/vit";
import { useApp } from "../../state/AppState";
import { TooltipBox } from "../ui";
import { axisLabel, axisProps, colouredBar, gridProps } from "./common";

export interface GradedBin {
  x0: number;
  x1: number;
  mid: number;
  count: number;
  expected: number;
  grade: Grade;
}

/** Histogram of totals (or z-scores), each bar coloured by the grade its bin falls in, with the cutoff lines. */
export function GradedHistogram({
  bins,
  cutoffs,
  xLabel,
  ticks,
  cutoffLabel,
  binLabel,
}: {
  bins: GradedBin[];
  cutoffs: Cutoffs;
  xLabel: string;
  ticks: number[];
  cutoffLabel: (g: Exclude<Grade, "F">) => string;
  binLabel: (b: GradedBin) => string;
}) {
  const { chart } = useApp();
  const lo = bins[0].x0;
  const hi = bins[bins.length - 1].x1;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={bins} margin={{ top: 28, right: 14, bottom: 18, left: 0 }} barCategoryGap={1}>
        <CartesianGrid {...gridProps(chart)} />
        <XAxis dataKey="mid" type="number" domain={[lo, hi]} {...axisProps(chart)} ticks={ticks} label={axisLabel(chart, xLabel, "x")} />
        <YAxis {...axisProps(chart)} width={36} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: chart.grid, opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const b = payload[0].payload as GradedBin;
            return (
              <TooltipBox
                title={binLabel(b)}
                rows={[
                  { label: `Students (grade ${b.grade})`, value: b.count, color: chart.grade[b.grade] },
                  { label: "Normal curve", value: fmt(b.expected) },
                ]}
              />
            );
          }}
        />
        {PASS_GRADES.map((g) =>
          cutoffs[g] > lo && cutoffs[g] < hi ? (
            <ReferenceLine key={g} x={cutoffs[g]} stroke={chart.ink2} strokeWidth={1} label={{ value: cutoffLabel(g), position: "top", fill: chart.ink2, fontSize: 11 }} />
          ) : null,
        )}
        <Bar dataKey="count" isAnimationActive={false} shape={colouredBar((d) => chart.grade[d.grade as Grade], [3, 3, 0, 0])} />
        <Line dataKey="expected" type="monotone" stroke={chart.ink2} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
