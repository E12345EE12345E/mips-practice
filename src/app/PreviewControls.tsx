import { visibleOutput } from "../state/session";
import type { Session } from "../state/useSession";

function statusText(session: Session): { text: string; tone: "info" | "ok" | "error" } {
  const { status, lastValid } = session;
  switch (status.kind) {
    case "idle":
      return { text: "No preview yet. Edit your assembly or press Run preview.", tone: "info" };
    case "running":
      return { text: "Running preview…", tone: "info" };
    case "ok": {
      const snap = session.display.snapshot;
      const exit = snap?.exitCode;
      return {
        text: `Status: OK. ${snap ? `${snap.instructionCount} instructions` : ""}${exit !== null && exit !== undefined ? `, exit code ${exit}` : ""} (${Math.round(status.elapsedMs)} ms)`,
        tone: "ok",
      };
    }
    case "assembly-error": {
      const first = status.diagnostics[0];
      return {
        text: `Status: assembly error${first ? ` at line ${first.line}: ${first.message}` : ""}.${lastValid ? " Showing last valid preview." : " No valid preview yet."}`,
        tone: "error",
      };
    }
    case "fault": {
      const where = status.fault.line > 0 ? ` at line ${status.fault.line}` : "";
      return {
        text: `Status: runtime fault${where}: ${status.fault.message}.${lastValid ? " Showing last valid preview." : ""}`,
        tone: "error",
      };
    }
    case "error":
      return { text: `Status: ${status.message}`, tone: "error" };
  }
}

export default function PreviewControls({ session }: { session: Session }) {
  const { actions, view, display, stepState, status, faultView, displayMode, lastValid, sourceRevision } = session;
  const noInput = view.entry.id === "constant-arithmetic";
  const { text, tone } = statusText(session);
  const stdout = display.snapshot?.stdout ?? "";

  return (
    <div className="preview-controls" data-testid="preview-controls">
      <div className="control-row">
        <label htmlFor="sample-input">Sample input (stdin)</label>
        <input
          id="sample-input"
          type="text"
          value={session.previewStdin.replace(/\n$/, "")}
          onChange={(e) => actions.updatePreviewStdin(e.target.value)}
          disabled={noInput}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={session.inputError !== null}
          aria-describedby="sample-input-help"
          placeholder={noInput ? "This exercise reads no input" : ""}
        />
      </div>
      <p id="sample-input-help" className={session.inputError ? "field-error" : "note"} role={session.inputError ? "alert" : undefined}>
        {session.inputError
          ? `Invalid sample input: ${session.inputError} The preview keeps the last valid run.`
          : noInput
            ? "No input needed. This sample is separate from the hidden cases."
            : "Your own preview input. It is separate from the hidden cases."}
      </p>

      <div className="control-row buttons">
        <button type="button" className="primary" onClick={actions.runPreview}>
          Run preview
        </button>
        <button type="button" onClick={actions.step} title="Execute one more source instruction from a fresh start">
          Step
        </button>
        <button type="button" onClick={actions.reset} disabled={stepState === null && display.kind !== "fault" && displayMode === "final"}>
          Reset
        </button>
        <label className="check">
          <input type="checkbox" checked={session.autoPreview} onChange={(e) => actions.setAutoPreview(e.target.checked)} />
          Auto-preview
        </label>
        <label className="check">
          <input type="checkbox" checked={session.expandedSteps} onChange={(e) => actions.setExpandedSteps(e.target.checked)} />
          Expanded instructions
        </label>
      </div>

      <div className="control-row buttons">
        <span id="view-label">View:</span>
        <div role="group" aria-labelledby="view-label" className="segmented">
          <button
            type="button"
            aria-pressed={displayMode === "final" && stepState === null}
            onClick={() => {
              actions.setDisplayMode("final");
              if (stepState) actions.reset();
            }}
          >
            Final state
          </button>
          <button
            type="button"
            aria-pressed={displayMode === "initial" && stepState === null}
            disabled={!lastValid}
            onClick={() => {
              if (stepState) actions.reset();
              actions.setDisplayMode("initial");
            }}
          >
            Assembled data
          </button>
          {faultView ? (
            <button
              type="button"
              aria-pressed={displayMode === "fault" && stepState === null}
              onClick={() => {
                if (stepState) actions.reset();
                actions.setDisplayMode("fault");
              }}
            >
              Fault state
            </button>
          ) : null}
        </div>
        <span id="format-label">Values:</span>
        <div role="group" aria-labelledby="format-label" className="segmented">
          <button type="button" aria-pressed={session.numberFormat === "dec"} onClick={() => actions.setNumberFormat("dec")}>
            Decimal
          </button>
          <button type="button" aria-pressed={session.numberFormat === "hex"} onClick={() => actions.setNumberFormat("hex")}>
            Hex
          </button>
        </div>
      </div>

      <p className={`status status-${tone}`} role="status" data-testid="preview-status">
        {text}
      </p>
      {display.staleReason ? (
        <p className="status status-stale" data-testid="stale-banner">
          {display.staleReason}
        </p>
      ) : null}
      <p className="note" data-testid="preview-label">
        {display.snapshot ? (
          <>
            {display.label}
            {lastValid && display.kind !== "step" ? ` · preview of source version ${lastValid.sourceRevision}` : ""}
            {` · current source version ${sourceRevision}`}
            {display.stale ? " · stale" : ""}
            {status.kind === "running" ? " · updating" : ""}
          </>
        ) : (
          "No preview yet"
        )}
      </p>

      <div className="stdout-block">
        <div className="stdout-title">Preview output (stdout){display.snapshot ? ` · ${stdout.length} byte${stdout.length === 1 ? "" : "s"}` : ""}</div>
        <pre className="stdout" data-testid="preview-stdout" aria-label="Preview stdout" tabIndex={0}>
          {display.snapshot ? (stdout.length > 0 ? visibleOutput(stdout) : "(no output)") : ""}
        </pre>
      </div>
    </div>
  );
}
