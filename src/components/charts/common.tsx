import { Rectangle, type BarShapeProps } from "recharts";
import type { ChartTheme } from "../../theme";

/** Shared axis styling: recessive hairline axis, muted tick labels, no tick marks. */
export function axisProps(t: ChartTheme) {
  return {
    stroke: t.axis,
    tick: { fill: t.muted, fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: t.axis },
  } as const;
}

export function gridProps(t: ChartTheme) {
  return { stroke: t.grid, strokeDasharray: undefined, vertical: false } as const;
}

export function axisLabel(t: ChartTheme, value: string, axis: "x" | "y") {
  return axis === "x"
    ? { value, position: "insideBottom" as const, offset: -4, fill: t.muted, fontSize: 12 }
    : { value, angle: -90, position: "insideLeft" as const, fill: t.muted, fontSize: 12, style: { textAnchor: "middle" as const } };
}

/** Bar shape that colours each bar from its data row (replaces the deprecated <Cell>). */
export function colouredBar(colorOf: (payload: Record<string, unknown>) => string, radius: [number, number, number, number] = [4, 4, 0, 0]) {
  return function ColouredBar(props: BarShapeProps) {
    const payload = (props as unknown as { payload: Record<string, unknown> }).payload;
    return <Rectangle {...(props as object)} radius={radius} fill={colorOf(payload)} />;
  };
}

export const CHART_MARGIN = { top: 10, right: 12, bottom: 18, left: 4 };
