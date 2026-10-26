/**
 * Colour tokens for charts. Grade colours form a diverging scale centred on B
 * (the class-average band): blue above the mean, neutral grey at B, red below.
 * Each arm was validated as an ordinal ramp (monotone lightness, ≥ 0.06 ΔL
 * between steps) for both light and dark surfaces.
 */
import type { Grade } from "./lib/vit";

export type ThemeMode = "light" | "dark";

export interface ChartTheme {
  mode: ThemeMode;
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  /** Categorical slots, fixed order. */
  series: [string, string, string];
  grade: Record<Grade, string>;
  /** Sequential ramp (low → high) for counts. */
  sequential: string[];
  /** Diverging ramp for correlations: negative arm (weak → strong), midpoint, positive arm (weak → strong). */
  diverging: { negative: string[]; mid: string; positive: string[] };
  good: string;
  critical: string;
}

const LIGHT: ChartTheme = {
  mode: "light",
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a"],
  grade: { S: "#1962b6", A: "#65a1ee", B: "#b9b8b0", C: "#ed8c84", D: "#e3645f", E: "#cf4040", F: "#a92227" },
  sequential: ["#f0efec", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  diverging: {
    negative: ["#ffd6d2", "#f9aea7", "#eb827b", "#da534f", "#ba3535", "#901e21"],
    mid: "#f0efec",
    positive: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"],
  },
  good: "#006300",
  critical: "#d03b3b",
};

const DARK: ChartTheme = {
  mode: "dark",
  surface: "#1a1a19",
  ink: "#f0efec",
  ink2: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  series: ["#3987e5", "#d95926", "#199e70"],
  grade: { S: "#87bafe", A: "#4d88d3", B: "#5f5e59", C: "#ab413e", D: "#ce514d", E: "#e66e68", F: "#f4928a" },
  sequential: ["#262624", "#1d3350", "#184f95", "#256abf", "#3987e5", "#5598e7", "#86b6ef", "#b7d3f6"],
  diverging: {
    negative: ["#4a2524", "#6e2a28", "#901e21", "#ba3535", "#da534f", "#eb827b"],
    mid: "#383835",
    positive: ["#1d3350", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"],
  },
  good: "#0ca30c",
  critical: "#d03b3b",
};

export function chartTheme(mode: ThemeMode): ChartTheme {
  return mode === "dark" ? DARK : LIGHT;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Text colour (white or near-black) that stays legible on top of `fill`. */
export function inkOn(fill: string): string {
  return luminance(fill) > 0.32 ? "#0b0b0b" : "#ffffff";
}

/** Picks a step from a ramp for t in [0, 1]. */
export function rampAt(ramp: readonly string[], t: number): string {
  const i = Math.round(Math.min(1, Math.max(0, t)) * (ramp.length - 1));
  return ramp[i];
}

/** Diverging colour for a value in [−1, 1]. */
export function divergingAt(theme: ChartTheme, v: number): string {
  if (Math.abs(v) < 0.05) return theme.diverging.mid;
  const arm = v > 0 ? theme.diverging.positive : theme.diverging.negative;
  return rampAt(arm, (Math.abs(v) - 0.05) / 0.95);
}
