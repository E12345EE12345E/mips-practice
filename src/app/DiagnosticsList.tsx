import type { Diagnostic } from "../mips/types";

export default function DiagnosticsList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return (
      <div className="diagnostics" data-testid="diagnostics">
        <span className="note">No diagnostics.</span>
      </div>
    );
  }
  return (
    <div className="diagnostics" data-testid="diagnostics">
      <ul aria-label="Diagnostics">
        {diagnostics.map((d, i) => (
          <li key={`${d.line}:${d.col}:${i}`} className={`diag diag-${d.severity}`}>
            <strong>{d.severity === "error" ? "Error" : "Warning"}</strong> line {d.line}, column {d.col}: {d.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
