import { useState, type ReactNode } from "react";
import type { Grade } from "../lib/vit";
import { useApp } from "../state/AppState";
import { inkOn } from "../theme";

export function Card({ title, subtitle, actions, children, foot, className = "" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
      {foot && <p className="card-foot">{foot}</p>}
    </section>
  );
}

export interface Column<T> {
  key: string;
  label: ReactNode;
  num?: boolean;
  render?: (row: T) => ReactNode;
}

export function DataTable<T extends object>({ columns, rows, highlight, maxHeight }: { columns: Column<T>[]; rows: T[]; highlight?: (row: T) => boolean; maxHeight?: number }) {
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? "num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={highlight?.(r) ? "highlight" : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "num" : undefined}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A chart card with a Chart / Table toggle so every value is reachable without hovering. */
export function ChartCard<T extends object>({ title, subtitle, table, children, foot, extra }: { title: ReactNode; subtitle?: ReactNode; table?: { columns: Column<T>[]; rows: T[] }; children: ReactNode; foot?: ReactNode; extra?: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card
      title={title}
      subtitle={subtitle}
      foot={foot}
      actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {extra}
          {table && (
            <Segmented
              small
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          )}
        </div>
      }
    >
      {view === "chart" || !table ? children : <DataTable columns={table.columns} rows={table.rows} maxHeight={340} />}
    </Card>
  );
}

export function StatTile({ label, value, unit, sub }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {value}
        {unit && <span className="tile-unit">{unit}</span>}
      </div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export function Segmented<V extends string>({ value, onChange, options, small, label }: { value: V; onChange: (v: V) => void; options: { value: V; label: ReactNode }[]; small?: boolean; label?: string }) {
  return (
    <div className={`segmented ${small ? "small" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SliderField({ label, hint, value, min, max, step, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
    setDraft(null);
  };
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <div className="field-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <div className="slider-row">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <input
          className="num-input"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(value)}
          aria-label={`${label} value`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        />
      </div>
    </div>
  );
}

export function GradeChip({ grade, size = "sm" }: { grade: Grade; size?: "sm" | "lg" }) {
  const { chart } = useApp();
  const bg = chart.grade[grade];
  return (
    <span className={size === "lg" ? "hero-grade" : "grade-chip"} style={{ background: bg, color: inkOn(bg) }} aria-label={`Grade ${grade}`}>
      {grade}
    </span>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind?: "box" | "line" | "dot" }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="legend-item" key={it.label}>
          <span className={`swatch ${it.kind === "line" ? "line" : it.kind === "dot" ? "dot" : ""}`} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Tooltip body shared by all Recharts charts. */
export function TooltipBox({ title, rows }: { title?: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="tooltip">
      {title !== undefined && <div className="tooltip-title">{title}</div>}
      {rows.map((r, i) => (
        <div className="tooltip-row" key={i}>
          <span>
            {r.color && <span className="swatch" style={{ background: r.color }} />}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export function PageHead({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </div>
  );
}
