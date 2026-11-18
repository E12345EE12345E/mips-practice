import { useState } from "react";
import { DIRECTIVES } from "../mips/directives";
import { INSTRUCTIONS } from "../mips/instructions";
import { LIMITS } from "../mips/limits";
import { SYSCALL_DOCS } from "../mips/syscalls";
import { PROBLEM_TYPES } from "../problems/registry";
import type { Session } from "../state/useSession";

function ReferencePanel() {
  return (
    <details className="reference">
      <summary>Language and syscall reference</summary>
      <h4>Dialect</h4>
      <ul>
        <li>MIPS32 teaching subset with MARS-style register names and syscall numbers. There are no branch delay slots.</li>
        <li>Integers are 32-bit. Signed add/addi/sub trap on overflow; the unsigned forms wrap. Memory is little-endian; words must be 4-byte aligned.</li>
        <li>Execution starts at <code>main</code>. Exit with syscall 10, syscall 17 with $a0 = 0, or <code>jr $ra</code> with $v0 = 0.</li>
        <li>
          Every storage directive (<code>.space</code>, <code>.byte</code>/<code>.word</code> list, <code>.ascii</code>) is one allocation. Accesses that
          leave the allocation they were derived from fault, even if the address lands in a neighbouring allocation.
        </li>
        <li>
          Limits: {LIMITS.maxInstructions.toLocaleString()} executed instructions, {LIMITS.maxStdoutBytes / 1024} KiB of output.
        </li>
        <li>
          This is not full MARS: syscall 8 here reads a whitespace-delimited token like <code>scanf(&quot;%Ns&quot;)</code>; MARS reads a line like{" "}
          <code>fgets</code>.
        </li>
      </ul>
      <h4>Syscalls</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">$v0</th>
            <th scope="col">Operation</th>
            <th scope="col">Contract</th>
          </tr>
        </thead>
        <tbody>
          {SYSCALL_DOCS.map((s) => (
            <tr key={s.code}>
              <td>{s.code}</td>
              <td>{s.name}</td>
              <td>{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Instructions</h4>
      <p className="instruction-list">
        {INSTRUCTIONS.map((i) => (
          <code key={i.name} title={`${i.forms.map((f) => f.syntax).join(" | ")} — ${i.summary}`}>
            {i.name}
            {i.pseudo ? "*" : ""}
          </code>
        ))}
      </p>
      <p className="note">* pseudo-instruction (may use $at). Hover an instruction in the editor for its operand forms.</p>
      <h4>Directives</h4>
      <p className="instruction-list">
        {DIRECTIVES.map((d) => (
          <code key={d.name} title={`${d.syntax} — ${d.summary}`}>
            {d.name}
          </code>
        ))}
      </p>
    </details>
  );
}

export default function ProblemPanel({ session }: { session: Session }) {
  const { view, problem, actions } = session;
  const [family, setFamily] = useState<string>("");
  const [showBoilerplate, setShowBoilerplate] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyC = async () => {
    try {
      await navigator.clipboard.writeText(view.program.full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the code remains selectable on screen.
    }
  };

  return (
    <section className="panel problem-panel" aria-labelledby="problem-title">
      <header className="panel-header">
        <h1 id="problem-title">{view.spec.title}</h1>
        <div className="toolbar">
          <label className="sr-only" htmlFor="family-select">
            Exercise family
          </label>
          <select id="family-select" value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="">Any family</option>
            {PROBLEM_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={() => actions.newProblem(family || undefined)}>
            New problem
          </button>
        </div>
      </header>

      <div className="panel-body">
        {view.spec.instructions.map((text) => (
          <p key={text}>{text}</p>
        ))}

        <div className="c-block">
          <div className="c-toolbar">
            <span>C program</span>
            <span>
              <button type="button" className="mini-button" onClick={() => setShowBoilerplate((v) => !v)} aria-expanded={showBoilerplate}>
                {showBoilerplate ? "Hide headers and main()" : "Show headers and main()"}
              </button>{" "}
              <button type="button" className="mini-button" onClick={copyC}>
                {copied ? "Copied" : "Copy C"}
              </button>
            </span>
          </div>
          <pre className="c-code" data-testid="c-snippet" tabIndex={0} aria-label="C program">
            {showBoilerplate ? `${view.program.head}\n` : ""}
            <span className="c-body">{view.program.body}</span>
            {showBoilerplate ? `\n${view.program.tail}` : ""}
          </pre>
        </div>

        <p>
          <button
            type="button"
            className="mini-button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? "Hide details" : "More details"}
          </button>
        </p>
        {showDetails ? (
          <>
            <h2>Input</h2>
            <ul>
              {view.spec.inputConstraints.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h2>Output</h2>
            <p>{view.spec.outputDescription}</p>
            {view.spec.notes.length > 0 ? (
              <>
                <h2>Notes</h2>
                <ul>
                  {view.spec.notes.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mandatory" data-testid="no-error-checking">
              {view.noErrorChecking}
            </p>
          </>
        ) : null}
        <p className="note">
          Problem {problem.typeId} v{problem.typeVersion}
        </p>
        <ReferencePanel />
      </div>
    </section>
  );
}
