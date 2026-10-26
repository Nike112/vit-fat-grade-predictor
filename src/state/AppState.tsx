/**
 * App-wide state: datasets, grading rules, chosen model, the student's own marks
 * and the theme. Everything derived from the data (model fits, graded history)
 * is memoised here so every page shares one copy.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import currentCsv from "../../data/current_class.csv?raw";
import historicalCsv from "../../data/historical_marks.csv?raw";
import { parseMarksCsv } from "../lib/csv";
import { compareModels, estimateSectionEffect, getModel, withFat, type ModelComparison, type ModelId, type ModelSpec } from "../lib/model";
import type { OLSFit } from "../lib/regression";
import { DEFAULT_RULES, gradeClass, internalMarks, totalMarks, type Grade, type GradingRules, type StudentRecord } from "../lib/vit";
import { chartTheme, type ChartTheme, type ThemeMode } from "../theme";

export interface Dataset {
  records: StudentRecord[];
  /** "sample" for the bundled data, otherwise the uploaded file name. */
  source: string;
  issues: string[];
  csv: string;
}

export interface StudentInput {
  cat1: number;
  cat2: number;
  da1: number;
  da2: number;
  da3: number;
}

export type ClassSource = "current" | "typical";

export interface GradedRecord extends StudentRecord {
  fat: number;
  internal: number;
  total: number;
  grade: Grade;
}

export interface Analysis {
  spec: ModelSpec;
  fit: OLSFit;
  tau: number;
  comparisons: ModelComparison[];
  graded: GradedRecord[];
  sections: string[];
}

interface AppState {
  historical: Dataset;
  current: Dataset | null;
  loadHistorical(csv: string, source: string): string[];
  loadCurrent(csv: string, source: string): string[];
  resetHistorical(): void;
  resetCurrent(): void;
  clearCurrent(): void;
  rules: GradingRules;
  setRules(r: GradingRules): void;
  modelId: ModelId;
  setModelId(id: ModelId): void;
  student: StudentInput;
  setStudent(s: StudentInput): void;
  classSource: ClassSource;
  setClassSource(c: ClassSource): void;
  theme: ThemeMode;
  setTheme(t: ThemeMode): void;
  chart: ChartTheme;
  analysis: Analysis | null;
  analysisError: string | null;
}

const Ctx = createContext<AppState | null>(null);

const KEY = "gradecast:v1:";

function usePersistent<T>(name: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(KEY + name);
      return raw ? { ...(initial as object), ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(KEY + name, JSON.stringify(v));
    } catch {
      /* storage full or disabled — keep in memory only */
    }
  };
  return [value, set];
}

function makeDataset(csv: string, source: string, requireFat: boolean, defaultSection: string): Dataset {
  const parsed = parseMarksCsv(csv, { requireFat, defaultSection });
  return { records: parsed.records, source, issues: parsed.issues, csv };
}

const SAMPLE_HISTORICAL = () => makeDataset(historicalCsv, "sample", true, "Past class");
const SAMPLE_CURRENT = () => makeDataset(currentCsv, "sample", false, "Current class");

export const DEFAULT_STUDENT: StudentInput = { cat1: 32, cat2: 36, da1: 9, da2: 8.5, da3: 9 };

function initialTheme(): ThemeMode {
  const saved = localStorage.getItem(KEY + "theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePersistent<{ historical: { csv: string; source: string } | null; current: { csv: string; source: string } | null | "none" }>(
    "datasets",
    { historical: null, current: null },
  );
  const [historical, setHistorical] = useState<Dataset>(() =>
    stored.historical ? makeDataset(stored.historical.csv, stored.historical.source, true, "Past class") : SAMPLE_HISTORICAL(),
  );
  const [current, setCurrent] = useState<Dataset | null>(() => {
    if (stored.current === "none") return null;
    return stored.current ? makeDataset(stored.current.csv, stored.current.source, false, "Current class") : SAMPLE_CURRENT();
  });
  const [rules, setRules] = usePersistent<GradingRules>("rules", DEFAULT_RULES);
  const [modelPref, setModelPref] = usePersistent<{ id: ModelId }>("model", { id: "multiple" });
  const [student, setStudent] = usePersistent<StudentInput>("student", DEFAULT_STUDENT);
  const [classPref, setClassPref] = usePersistent<{ source: ClassSource }>("class", { source: "current" });
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const { analysis, analysisError } = useMemo(() => {
    try {
      const rows = withFat(historical.records);
      if (rows.length < 10) throw new Error("Upload at least 10 past students with FAT marks to train the model.");
      const comparisons = compareModels(rows);
      const chosen = comparisons.find((c) => c.spec.id === modelPref.id) ?? comparisons[0];
      const tau = estimateSectionEffect(chosen.fit, rows);

      // Grade every past section with the current rules.
      const bySection = new Map<string, typeof rows>();
      for (const r of rows) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
      const graded: GradedRecord[] = [];
      for (const list of bySection.values()) {
        const internals = list.map(internalMarks);
        const g = gradeClass(
          internals,
          list.map((r) => r.fat),
          rules,
        );
        list.forEach((r, i) => graded.push({ ...r, internal: internals[i], total: totalMarks(internals[i], r.fat), grade: g.grades[i] }));
      }
      return {
        analysis: { spec: getModel(chosen.spec.id), fit: chosen.fit, tau, comparisons, graded, sections: [...bySection.keys()] },
        analysisError: null,
      };
    } catch (e) {
      return { analysis: null, analysisError: (e as Error).message };
    }
  }, [historical, modelPref.id, rules]);

  const value: AppState = {
    historical,
    current,
    loadHistorical(csv, source) {
      const d = makeDataset(csv, source, true, "Past class");
      if (d.records.length) {
        setHistorical(d);
        setStored({ ...stored, historical: { csv, source } });
      }
      return d.records.length ? d.issues : d.issues.length ? d.issues : ["No valid rows found."];
    },
    loadCurrent(csv, source) {
      const d = makeDataset(csv, source, false, "Current class");
      if (d.records.length) {
        setCurrent(d);
        setStored({ ...stored, current: { csv, source } });
        setClassPref({ source: "current" });
      }
      return d.records.length ? d.issues : d.issues.length ? d.issues : ["No valid rows found."];
    },
    resetHistorical() {
      setHistorical(SAMPLE_HISTORICAL());
      setStored({ ...stored, historical: null });
    },
    resetCurrent() {
      setCurrent(SAMPLE_CURRENT());
      setStored({ ...stored, current: null });
    },
    clearCurrent() {
      setCurrent(null);
      setStored({ ...stored, current: "none" });
      setClassPref({ source: "typical" });
    },
    rules,
    setRules,
    modelId: modelPref.id,
    setModelId: (id) => setModelPref({ id }),
    student,
    setStudent,
    classSource: current ? classPref.source : "typical",
    setClassSource: (source) => setClassPref({ source }),
    theme,
    setTheme(t) {
      setThemeState(t);
      localStorage.setItem(KEY + "theme", t);
    },
    chart: chartTheme(theme),
    analysis,
    analysisError,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppStateProvider");
  return ctx;
}

export function studentMarks(s: StudentInput) {
  return { cat1: s.cat1, cat2: s.cat2, da: s.da1 + s.da2 + s.da3 };
}
