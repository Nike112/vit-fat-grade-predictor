/**
 * CSV import/export for mark sheets.
 *
 * Accepted columns (case, spaces, "_" and "-" are ignored):
 *   student_id | id | reg_no            optional
 *   section | slot | class              optional (used for relative grading per class)
 *   cat1, cat2                          required, out of 50
 *   da1, da2, da3  OR  da (total /30)   required
 *   fat                                 required for past classes, out of 100
 */
import { SCHEME, type StudentRecord } from "./vit";

export interface ParseResult {
  records: StudentRecord[];
  /** Human-readable problems (skipped rows, missing columns). */
  issues: string[];
  /** Rows skipped because of invalid values. */
  skipped: number;
}

const ALIASES: Record<string, string[]> = {
  id: ["studentid", "id", "regno", "registerno", "registernumber", "rollno", "name"],
  section: ["section", "slot", "class", "classid", "batch"],
  cat1: ["cat1", "cati", "cat1marks"],
  cat2: ["cat2", "catii", "cat2marks"],
  da1: ["da1", "assignment1", "quiz1"],
  da2: ["da2", "assignment2", "quiz2"],
  da3: ["da3", "assignment3", "quiz3"],
  da: ["da", "datotal", "dasum", "assignments", "assignmenttotal"],
  fat: ["fat", "fatmarks", "final", "finalexam"],
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[\s_\-.()/]/g, "");

/** Splits one CSV line, honouring double-quoted fields. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseMarksCsv(text: string, opts: { requireFat: boolean; defaultSection?: string }): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const issues: string[] = [];
  if (lines.length < 2) return { records: [], issues: ["The file needs a header row and at least one student."], skipped: 0 };

  const header = splitLine(lines[0]).map(normalizeHeader);
  const col: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = header.findIndex((h) => names.includes(h));
    if (idx >= 0) col[key] = idx;
  }

  const missing: string[] = [];
  if (col.cat1 === undefined) missing.push("cat1");
  if (col.cat2 === undefined) missing.push("cat2");
  if (col.da === undefined && col.da1 === undefined) missing.push("da1/da2/da3 or da");
  if (opts.requireFat && col.fat === undefined) missing.push("fat");
  if (missing.length) return { records: [], issues: [`Missing column(s): ${missing.join(", ")}.`], skipped: 0 };

  const records: StudentRecord[] = [];
  let skipped = 0;
  const complain = (row: number, msg: string) => {
    skipped++;
    if (issues.length < 6) issues.push(`Row ${row}: ${msg}`);
  };

  for (let li = 1; li < lines.length; li++) {
    const cells = splitLine(lines[li]);
    const num = (key: string): number | null => {
      const i = col[key];
      if (i === undefined) return null;
      const raw = cells[i];
      if (raw === undefined || raw === "") return null;
      const v = Number(raw);
      return Number.isFinite(v) ? v : NaN;
    };
    const cat1 = num("cat1");
    const cat2 = num("cat2");
    let da: number | null;
    if (col.da !== undefined) {
      da = num("da");
    } else {
      const parts = [num("da1"), num("da2"), num("da3")].filter((v): v is number => v !== null);
      da = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
      if (parts.some((p) => Number.isNaN(p) || p < 0 || p > SCHEME.da.partMax)) {
        complain(li + 1, `each DA must be between 0 and ${SCHEME.da.partMax}.`);
        continue;
      }
    }
    const fat = num("fat");

    if (cat1 === null || cat2 === null || da === null) {
      complain(li + 1, "missing CAT or DA marks.");
      continue;
    }
    if ([cat1, cat2].some((v) => Number.isNaN(v) || v < 0 || v > SCHEME.cat1.max)) {
      complain(li + 1, `CAT marks must be between 0 and ${SCHEME.cat1.max}.`);
      continue;
    }
    if (Number.isNaN(da) || da < 0 || da > SCHEME.da.max) {
      complain(li + 1, `DA total must be between 0 and ${SCHEME.da.max}.`);
      continue;
    }
    if (opts.requireFat && fat === null) {
      complain(li + 1, "missing FAT marks.");
      continue;
    }
    if (fat !== null && (Number.isNaN(fat) || fat < 0 || fat > SCHEME.fat.max)) {
      complain(li + 1, `FAT must be between 0 and ${SCHEME.fat.max}.`);
      continue;
    }

    const id = col.id !== undefined && cells[col.id] ? cells[col.id] : `Row ${li}`;
    const section = col.section !== undefined && cells[col.section] ? cells[col.section] : (opts.defaultSection ?? "Class");
    records.push({ id, section, cat1, cat2, da, fat: opts.requireFat ? fat : null });
  }

  if (skipped > issues.length) issues.push(`…and ${skipped - issues.length} more row(s) skipped.`);
  return { records, issues, skipped };
}

export function recordsToCsv(records: readonly StudentRecord[], includeFat: boolean): string {
  const head = ["student_id", "section", "cat1", "cat2", "da", ...(includeFat ? ["fat"] : [])];
  const body = records.map((r) => [r.id, r.section, r.cat1, r.cat2, r.da, ...(includeFat ? [r.fat ?? ""] : [])].join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}

export const HISTORICAL_TEMPLATE = "student_id,section,cat1,cat2,da1,da2,da3,fat\nSTU-0001,WIN2526-A1,34,38,9,8.5,9,72\n";
export const CURRENT_TEMPLATE = "student_id,section,cat1,cat2,da1,da2,da3\nSTU-0101,FALL2627-A1,31,36,9,9,8\n";
