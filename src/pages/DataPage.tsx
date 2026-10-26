import { useRef, useState } from "react";
import { Card, DataTable, GradeChip, PageHead, Segmented } from "../components/ui";
import { CURRENT_TEMPLATE, HISTORICAL_TEMPLATE, recordsToCsv } from "../lib/csv";
import { fmt } from "../lib/format";
import { internalMarks, type StudentRecord } from "../lib/vit";
import { useApp, type Dataset, type GradedRecord } from "../state/AppState";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function UploadBox({ onFile }: { onFile: (text: string, name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const read = (f: File | undefined) => {
    if (!f) return;
    f.text().then((t) => onFile(t, f.name));
  };
  return (
    <div
      className={`upload-drop ${over ? "over" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        read(e.dataTransfer.files[0]);
      }}
    >
      <b>Drop a CSV here</b> or click to choose a file
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => read(e.target.files?.[0])} />
    </div>
  );
}

function DatasetCard({
  title,
  subtitle,
  data,
  includeFat,
  template,
  templateName,
  onLoad,
  onReset,
  onClear,
}: {
  title: string;
  subtitle: string;
  data: Dataset | null;
  includeFat: boolean;
  template: string;
  templateName: string;
  onLoad: (text: string, name: string) => string[];
  onReset: () => void;
  onClear?: () => void;
}) {
  const [messages, setMessages] = useState<string[]>([]);
  const sections = data ? new Set(data.records.map((r) => r.section)).size : 0;
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="stack" style={{ gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {data ? (
            <>
              <span className="pill">{data.source === "sample" ? "Simulated sample data" : `Uploaded: ${data.source}`}</span>
              <span className="pill">{data.records.length} students</span>
              <span className="pill">
                {sections} section{sections === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <span className="pill">Not loaded — predictions use a typical past class</span>
          )}
        </div>
        <UploadBox onFile={(text, name) => setMessages(onLoad(text, name))} />
        {messages.length > 0 && (
          <div className="notice">
            {messages.map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        )}
        <div className="btn-row">
          {data && (
            <button className="btn" type="button" onClick={() => download(includeFat ? "historical_marks.csv" : "current_class.csv", recordsToCsv(data.records, includeFat))}>
              Download data
            </button>
          )}
          <button className="btn" type="button" onClick={() => download(templateName, template)}>
            Download template
          </button>
          {data?.source !== "sample" && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                onReset();
                setMessages([]);
              }}
            >
              Use sample data
            </button>
          )}
          {onClear && data && (
            <button className="btn" type="button" onClick={onClear}>
              Remove
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function DataPage() {
  const app = useApp();
  const [view, setView] = useState<"past" | "current">("past");
  const graded = app.analysis?.graded ?? [];

  return (
    <>
      <PageHead
        title="Data"
        description="The app ships with simulated mark sheets so it works out of the box. Upload your own CSVs (for example, anonymised marks shared by seniors or your faculty) — everything stays in your browser."
      />
      <div className="stack">
        <div className="grid grid-2">
          <DatasetCard
            title="Past classes (training data)"
            subtitle="Students who have already written the FAT. The model learns the CAT/DA → FAT relationship from these."
            data={app.historical}
            includeFat
            template={HISTORICAL_TEMPLATE}
            templateName="past_classes_template.csv"
            onLoad={app.loadHistorical}
            onReset={app.resetHistorical}
          />
          <DatasetCard
            title="Current class (optional)"
            subtitle="Your classmates' internal marks. Relative grading compares you with them, so this sharpens the cutoff predictions."
            data={app.current}
            includeFat={false}
            template={CURRENT_TEMPLATE}
            templateName="current_class_template.csv"
            onLoad={app.loadCurrent}
            onReset={app.resetCurrent}
            onClear={app.clearCurrent}
          />
        </div>

        <Card title="CSV format">
          <div className="prose" style={{ maxWidth: "none" }}>
            <p>
              One row per student with a header row. Column names are matched loosely (case, spaces, <code>_</code> and <code>-</code> are ignored).
            </p>
            <ul>
              <li>
                <code>cat1</code>, <code>cat2</code> — raw CAT marks out of 50 (required)
              </li>
              <li>
                <code>da1</code>, <code>da2</code>, <code>da3</code> — each out of 10, <em>or</em> a single <code>da</code> column out of 30 (required)
              </li>
              <li>
                <code>fat</code> — out of 100 (required for past classes, ignored for the current class)
              </li>
              <li>
                <code>student_id</code> and <code>section</code> — optional. Relative grading is applied separately within each section.
              </li>
            </ul>
          </div>
        </Card>

        <Card
          title="Preview"
          actions={
            <Segmented
              small
              value={view}
              onChange={setView}
              options={[
                { value: "past", label: "Past classes" },
                { value: "current", label: "Current class" },
              ]}
            />
          }
          foot={view === "past" ? "Grades are recomputed from the marks with the current grading rules." : "FAT for the current class is what the simulator predicts."}
        >
          {view === "past" ? (
            <DataTable<GradedRecord>
              maxHeight={420}
              columns={[
                { key: "id", label: "Student" },
                { key: "section", label: "Section" },
                { key: "cat1", label: "CAT-1", num: true },
                { key: "cat2", label: "CAT-2", num: true },
                { key: "da", label: "DA", num: true },
                { key: "internal", label: "Internal", num: true, render: (r) => fmt(r.internal) },
                { key: "fat", label: "FAT", num: true },
                { key: "total", label: "Total", num: true, render: (r) => fmt(r.total) },
                { key: "grade", label: "Grade", render: (r) => <GradeChip grade={r.grade} /> },
              ]}
              rows={graded}
            />
          ) : app.current ? (
            <DataTable<StudentRecord>
              maxHeight={420}
              columns={[
                { key: "id", label: "Student" },
                { key: "section", label: "Section" },
                { key: "cat1", label: "CAT-1", num: true },
                { key: "cat2", label: "CAT-2", num: true },
                { key: "da", label: "DA", num: true },
                { key: "internal", label: "Internal", num: true, render: (r) => fmt(internalMarks(r)) },
              ]}
              rows={app.current.records}
            />
          ) : (
            <p className="muted">No current class loaded.</p>
          )}
        </Card>
      </div>
    </>
  );
}
