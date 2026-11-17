import { lazy, Suspense, useCallback, useRef, useState, type CSSProperties } from "react";
import { useSession } from "../state/useSession";
import DiagnosticsList from "./DiagnosticsList";
import PreviewControls from "./PreviewControls";
import ProblemPanel from "./ProblemPanel";
import ResizableDivider from "./ResizableDivider";
import SubmissionPanel from "./SubmissionPanel";
import MemoryTable from "../visualization/MemoryTable";
import "./layout.css";

// Monaco and React Flow are large; load them after the shell renders.
const AssemblyEditor = lazy(() => import("../editor/AssemblyEditor"));
const MemoryMap = lazy(() => import("../visualization/MemoryMap"));

type Tab = "problem" | "editor" | "memory";
type MemoryView = "graph" | "table";

export default function App() {
  const session = useSession();
  const { actions, layout } = session;
  const [tab, setTab] = useState<Tab>("problem");
  const [memoryView, setMemoryView] = useState<MemoryView>("graph");
  const appRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);

  const setColumn = useCallback(
    (columnPercent: number) => actions.setLayout({ ...layout, columnPercent }),
    [actions, layout],
  );
  const setPrompt = useCallback(
    (promptPercent: number) => actions.setLayout({ ...layout, promptPercent }),
    [actions, layout],
  );

  const style = {
    "--column": `${layout.columnPercent}%`,
    "--prompt": `${layout.promptPercent}%`,
  } as CSSProperties;

  const snapshot = session.display.snapshot;

  return (
    <div className="app" ref={appRef} style={style} data-tab={tab}>
      <nav className="tabs" aria-label="Panels">
        {(
          [
            ["problem", "Problem"],
            ["editor", "Editor"],
            ["memory", "Memory"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="left-column" ref={leftRef}>
        <div className="pane pane-problem" data-active={tab === "problem"}>
          <ProblemPanel session={session} />
        </div>
        <ResizableDivider
          orientation="horizontal"
          label="Resize problem and memory panels"
          value={layout.promptPercent}
          min={15}
          max={80}
          onChange={setPrompt}
          containerRef={leftRef}
        />
        <div className="pane pane-memory" data-active={tab === "memory"}>
          <section className="panel memory-panel" aria-label="Memory and registers">
            <PreviewControls session={session} />
            <div className="memory-view-switch" role="group" aria-label="Memory display">
              <button type="button" aria-pressed={memoryView === "graph"} onClick={() => setMemoryView("graph")}>
                Graph
              </button>
              <button type="button" aria-pressed={memoryView === "table"} onClick={() => setMemoryView("table")}>
                Table
              </button>
            </div>
            <div className="memory-content">
              {snapshot ? (
                memoryView === "graph" ? (
                  <Suspense fallback={<p className="note">Loading graph…</p>}>
                    <MemoryMap snapshot={snapshot} numberFormat={session.numberFormat} resetKey={session.problem.key} />
                  </Suspense>
                ) : (
                  <MemoryTable snapshot={snapshot} numberFormat={session.numberFormat} />
                )
              ) : (
                <p className="empty-state" data-testid="empty-preview">
                  No preview yet. Write assembly that assembles and runs, and its registers and memory appear here.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <ResizableDivider
        orientation="vertical"
        label="Resize left column and editor"
        value={layout.columnPercent}
        min={20}
        max={70}
        onChange={setColumn}
        containerRef={appRef}
      />

      <div className="pane pane-editor" data-active={tab === "editor"}>
        <section className="panel editor-panel" aria-label="Assembly editor">
          <header className="panel-header">
            <h2>Assembly</h2>
            <div className="toolbar">
              <span className="note">Source version {session.sourceRevision}</span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Replace your code with the starter template?")) actions.resetSourceToStarter();
                }}
              >
                Reset to starter
              </button>
            </div>
          </header>
          <div className="editor-wrap">
            <Suspense fallback={<p className="note editor-loading">Loading editor…</p>}>
              <AssemblyEditor
                docKey={session.problem.key}
                value={session.source}
                onChange={actions.updateSource}
                diagnostics={session.editorDiagnostics}
                currentLine={session.currentLine}
              />
            </Suspense>
          </div>
          <DiagnosticsList diagnostics={session.editorDiagnostics} />
          <SubmissionPanel session={session} />
        </section>
      </div>
    </div>
  );
}
