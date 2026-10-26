#!/usr/bin/env node
/**
 * Generates the sample datasets shipped with the app:
 *
 *   data/historical_marks.csv  – past class sections with CAT, DA and FAT marks
 *   data/current_class.csv     – the current class (internals only, FAT unknown)
 *
 * The marks are SIMULATED (no real student data is used). They come from a
 * latent-ability model so that the components are correlated the way real
 * marks are:
 *
 *   ability  a ~ N(0,1)   – drives CATs and FAT
 *   effort   e ~ N(0,1)   – drives DAs, slightly helps exams
 *   section shocks        – some CAT/FAT papers are harder than others
 *
 * Run `npm run generate-data` to regenerate. The seed is fixed, so the output
 * is reproducible.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

// ---------- seeded RNG ----------
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260915);
function normal() {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const roundTo = (x, step) => Math.round(x / step) * step;

// ---------- VIT theory-course scheme ----------
const internalOf = (r) => 0.3 * r.cat1 + 0.3 * r.cat2 + r.da1 + r.da2 + r.da3;
const totalOf = (r) => internalOf(r) + 0.4 * r.fat;

/** Relative grading: cutoffs at mean + k·SD of the section's totals; FAT < 40 ⇒ F. */
function gradeSection(rows) {
  const totals = rows.map(totalOf);
  const mu = totals.reduce((a, b) => a + b, 0) / totals.length;
  const sd = Math.sqrt(totals.reduce((a, t) => a + (t - mu) ** 2, 0) / (totals.length - 1));
  const bands = [
    ["S", 1.5],
    ["A", 0.5],
    ["B", -0.5],
    ["C", -1.0],
    ["D", -1.5],
    ["E", -2.0],
  ];
  return rows.map((r, i) => {
    if (r.fat < 40) return "F";
    for (const [g, k] of bands) if (totals[i] >= mu + k * sd) return g;
    return "F";
  });
}

// ---------- generator ----------
let idCounter = 1;
function makeSection(section, n, withFat) {
  const shift = {
    cat1: normal() * 2.5,
    cat2: normal() * 2.5,
    da: normal() * 0.35,
    fat: normal() * 4.5,
  };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const a = normal();
    const e = normal();
    const da = () => {
      if (rand() < 0.02) return 0; // missed submission
      return clamp(roundTo(8.0 + 1.3 * (0.35 * a + 0.55 * e + 0.76 * normal()) + shift.da, 0.5), 0, 10);
    };
    const row = {
      student_id: `STU-${String(idCounter++).padStart(4, "0")}`,
      section,
      cat1: clamp(Math.round(29 + 8.5 * (0.8 * a + 0.15 * e + 0.58 * normal()) + shift.cat1), 4, 50),
      cat2: clamp(Math.round(32 + 8 * (0.78 * a + 0.15 * e + 0.61 * normal()) + shift.cat2), 4, 50),
      da1: da(),
      da2: da(),
      da3: da(),
      fat: clamp(Math.round(60 + 14 * (0.8 * a + 0.1 * e + 0.59 * normal()) + shift.fat), 0, 100),
    };
    rows.push(row);
  }
  if (!withFat) return rows.map(({ fat: _fat, ...rest }) => rest);
  const grades = gradeSection(rows);
  return rows.map((r, i) => ({
    ...r,
    internal: +internalOf(r).toFixed(2),
    total: +totalOf(r).toFixed(2),
    grade: grades[i],
  }));
}

const HISTORICAL_SECTIONS = [
  ["FALL2324-A1", 66],
  ["WIN2324-B1", 61],
  ["FALL2425-A2", 68],
  ["WIN2425-C1", 59],
  ["FALL2526-B2", 64],
  ["WIN2526-A1", 70],
];

const historical = HISTORICAL_SECTIONS.flatMap(([s, n]) => makeSection(s, n, true));
const current = makeSection("FALL2627-A1", 64, false);

function toCsv(rows) {
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n") + "\n";
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "historical_marks.csv"), toCsv(historical));
writeFileSync(join(OUT_DIR, "current_class.csv"), toCsv(current));
console.log(`historical_marks.csv: ${historical.length} students in ${HISTORICAL_SECTIONS.length} sections`);
console.log(`current_class.csv:    ${current.length} students (FAT not yet written)`);
