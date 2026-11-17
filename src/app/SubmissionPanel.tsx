import type { Session } from "../state/useSession";

export default function SubmissionPanel({ session }: { session: Session }) {
  const { grade, gradeStale, actions, view, restoredNote, sourceRevision } = session;
  const running = grade.phase === "running";

  return (
    <div className="submission" data-testid="submission-panel">
      <div className="submission-row">
        <button type="button" className="primary large" onClick={actions.checkSolution} disabled={running}>
          {running ? "Checking…" : "Check solution"}
        </button>
        <span className="note">
          Runs your program against {view.entry.testCount} hidden test case{view.entry.testCount === 1 ? "" : "s"}.
        </span>
      </div>

      <div aria-live="polite" data-testid="grade-result">
        {restoredNote ? (
          <p className="status status-info">Restored draft: this session generated a fresh hidden test suite.</p>
        ) : null}
        {grade.phase === "running" ? (
          <p className="status status-info" role="status">
            Checking source version {grade.revision}…
          </p>
        ) : null}
        {grade.phase === "error" ? (
          <p className="status status-error" role="alert">
            Grading failed: {grade.message}
          </p>
        ) : null}
        {grade.phase === "done" ? (
          <div className={`result ${gradeStale ? "result-stale" : grade.result.passed === grade.result.total ? "result-pass" : "result-fail"}`}>
            <p className="result-summary">
              {gradeStale ? "Earlier result: " : ""}
              <strong data-testid="grade-summary">
                {grade.result.passed}/{grade.result.total} cases passed
              </strong>
              {grade.result.passed === grade.result.total ? " — all cases pass." : ""}
              {grade.result.failureCategories.length > 0
                ? `; ${grade.result.failureCategories
                    .map((c) => (c.count > 1 ? `${c.category} (${c.count})` : c.category))
                    .join(", ")}`
                : ""}
            </p>
            {gradeStale ? (
              <p className="status status-stale" data-testid="grade-stale">
                Stale: your code changed after this check (checked version {grade.revision}, current version {sourceRevision}). Check again for a current result.
              </p>
            ) : null}
            {grade.result.messages.length > 0 ? (
              <ul className="result-messages">
                {grade.result.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
