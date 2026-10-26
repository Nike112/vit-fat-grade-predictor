export const fmt = (x: number, digits = 1): string => (Number.isFinite(x) ? x.toFixed(digits) : "—");

export function pct(p: number, digits = 0): string {
  if (!Number.isFinite(p)) return "—";
  if (p > 0 && p < 0.005 && digits === 0) return "<1%";
  if (p < 1 && p > 0.995 && digits === 0) return ">99%";
  return `${(p * 100).toFixed(digits)}%`;
}

export function pValue(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export const signed = (x: number, digits = 2): string => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(digits);
