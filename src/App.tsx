import { lazy, Suspense, useEffect, useState } from "react";
import { useApp } from "./state/AppState";
import Predictor from "./pages/Predictor";

const Analytics = lazy(() => import("./pages/Analytics"));
const ModelLab = lazy(() => import("./pages/ModelLab"));
const Grading = lazy(() => import("./pages/Grading"));
const DataPage = lazy(() => import("./pages/DataPage"));
const Method = lazy(() => import("./pages/Method"));

const ROUTES = [
  { path: "predict", label: "Predictor", Component: Predictor },
  { path: "analytics", label: "Class analytics", Component: Analytics },
  { path: "model", label: "Model", Component: ModelLab },
  { path: "grading", label: "Grading rules", Component: Grading },
  { path: "data", label: "Data", Component: DataPage },
  { path: "method", label: "Method", Component: Method },
] as const;

function useHashRoute(): string {
  const read = () => window.location.hash.replace(/^#\/?/, "") || "predict";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const { theme, setTheme } = useApp();
  const active = ROUTES.find((r) => r.path === route) ?? ROUTES[0];
  const Page = active.Component;

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <a className="brand" href="#/predict" aria-label="GradeCast home">
            <span className="brand-mark" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 32 32">
                <path d="M4 24c4-1 5-15 12-15s8 14 12 15" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                <circle cx="16" cy="9" r="3" fill="#fff" />
              </svg>
            </span>
            <span>
              <div className="brand-name">GradeCast</div>
              <div className="brand-sub">VIT FAT &amp; grade predictor</div>
            </span>
          </a>
          <nav className="nav" aria-label="Sections">
            {ROUTES.map((r) => (
              <a key={r.path} href={`#/${r.path}`} aria-current={r.path === active.path ? "page" : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
          <button className="icon-btn" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Toggle theme">
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </header>
      <main>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Page />
        </Suspense>
      </main>
      <footer className="footer">
        GradeCast · A probability &amp; statistics project. Sample data is simulated; grading rules follow commonly reported VIT practice and can be adjusted on the Grading rules page. Predictions are estimates, not official results.
      </footer>
    </>
  );
}
