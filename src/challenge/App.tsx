import { useEffect, useRef, useState, type CSSProperties } from "react";
import { generateProblem } from "../problems/easy/registry";
import type { EasyProblem } from "../problems/easy/types";
import { CONFIG, PALETTE } from "./palette";
import "./style.css";
import { Grader } from "./Grader";
export function parseCell(s: string): number | null {
  const escapes: Record<string, number> = {
    "\\0": 0,
    "\\n": 10,
    "\\r": 13,
    "\\t": 9,
    "\\\\": 92,
  };
  return s in escapes
    ? escapes[s]
    : s.length === 1 && s !== "\\" && s.charCodeAt(0) < 128
      ? s.charCodeAt(0)
      : null;
}
function saved() {
  try {
    return Number(localStorage.getItem(CONFIG.storageKey)) || 0;
  } catch {
    return 0;
  }
}
export default function App() {
  const [phase, setPhase] = useState<
    | "home"
    | "starting"
    | "playing"
    | "solved"
    | "skipped"
    | "settling"
    | "finished"
  >("home");
  const [problem, setProblem] = useState<EasyProblem | null>(null);
  const [source, setSource] = useState("");
  const [cells, setCells] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [high, setHigh] = useState(saved);
  const [played, setPlayed] = useState(() => {
    try {
      return localStorage.getItem(CONFIG.storageKey) !== null;
    } catch {
      return false;
    }
  });
  const [remaining, setRemaining] = useState<number>(CONFIG.seconds);
  const [message, setMessage] = useState("");
  const [skipSolution, setSkipSolution] = useState("");
  const live = useRef({
    phase,
    problem,
    revision: 0,
    deadline: 0,
    index: 0,
    score: 0,
    pending: false,
  });
  const worker = useRef<Grader | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const scalar = useRef<HTMLInputElement | null>(null);
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const finish = () => {
    live.current.phase = "finished";
    setPhase("finished");
    const best = Math.max(saved(), live.current.score);
    setHigh(best);
    setPlayed(true);
    try {
      localStorage.setItem(CONFIG.storageKey, String(best));
    } catch {
      /* storage is optional */
    }
  };
  const next = () => {
    const p = generateProblem(live.current.index++);
    live.current.problem = p;
    live.current.revision++;
    setProblem(p);
    setSource("");
    setCells(Array.isArray(p.answer) ? p.answer.map(() => "") : []);
    setMessage("");
    setSkipSolution("");
    live.current.pending = false;
    live.current.phase = "playing";
    setPhase("playing");
  };
  const pass = () => {
    if (live.current.phase === "settling") {
      live.current.score++;
      setScore(live.current.score);
      finish();
      return;
    }
    if (live.current.phase !== "playing") return;
    live.current.phase = "solved";
    setPhase("solved");
    live.current.score++;
    setScore(live.current.score);
    live.current.deadline += CONFIG.transitionMs;
    timer.current = setTimeout(next, CONFIG.transitionMs);
  };
  useEffect(() => {
    const w = new Grader((r) => {
      if (
        r.id !== live.current.problem?.id ||
        r.revision !== live.current.revision ||
        !["playing", "settling"].includes(live.current.phase)
      )
        return;
      live.current.pending = false;
      if (r.passed) pass();
      else if (live.current.phase === "settling") finish();
      else setMessage(r.message);
    });
    worker.current = w;
    return () => {
      w.dispose();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        live.current.phase === "home" ||
        live.current.phase === "finished"
      )
        return;
      event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      live.current.revision++;
      live.current.pending = false;
      live.current.phase = "home";
      live.current.problem = null;
      live.current.score = 0;
      setProblem(null);
      setScore(0);
      setSkipSolution("");
      setPhase("home");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (live.current.phase !== "playing") return;
      const left = Math.max(
        0,
        (live.current.deadline - performance.now()) / 1000,
      );
      setRemaining(left);
      if (left === 0) {
        if (live.current.pending) {
          live.current.phase = "settling";
          setPhase("settling");
        } else finish();
      }
    }, 50);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (phase === "playing") {
      input.current?.focus();
      scalar.current?.focus();
      cellRefs.current[0]?.focus();
    }
  }, [phase, problem]);
  const start = () => {
    live.current.score = 0;
    live.current.index = 0;
    setScore(0);
    setRemaining(CONFIG.seconds);
    live.current.phase = "starting";
    setPhase("starting");
    timer.current = setTimeout(() => {
      live.current.deadline = performance.now() + CONFIG.seconds * 1000;
      next();
    }, CONFIG.transitionMs);
  };
  const edit = (value: string) => {
    if (live.current.phase !== "playing" || !problem) return;
    if (performance.now() >= live.current.deadline) return;
    setSource(value);
    const revision = ++live.current.revision;
    if (problem.category === "c_snippet_to_mips_easy") {
      live.current.pending = true;
      worker.current?.submit({ problem, source: value, revision });
    } else if (
      /^[+-]?\d+$/.test(value.trim()) &&
      Number(value) === problem.answer
    )
      pass();
  };
  const editCell = (i: number, value: string) => {
    if (live.current.phase !== "playing" || !problem) return;
    const updated = [...cells];
    updated[i] = value;
    setCells(updated);
    if (parseCell(value) !== null) cellRefs.current[i + 1]?.focus();
    const expected = problem.answer;
    if (
      Array.isArray(expected) &&
      updated.every((v, j) => parseCell(v) === expected[j])
    )
      pass();
  };
  const style = Object.fromEntries(
    Object.entries(PALETTE).map(([k, v]) => ["--" + k, v]),
  ) as CSSProperties;
  return (
    <main style={style} className="challenge">
      {phase === "home" || phase === "starting" ? (
        <section className={`home ${phase}`}>
          <p className="eyebrow">A LITTLE ASSEMBLY. A LITTLE PRESSURE.</p>
          <h1>
            MIPS
            <br />
            <span>Practice</span>
          </h1>
          <p className="intro">Think in instructions.</p>
          <button
            className="start"
            disabled={phase === "starting"}
            onClick={start}
          >
            Start
          </button>
          {phase === "starting" && (
            <div className="particles" aria-hidden>
              {Array.from({ length: 24 }, (_, i) => (
                <i
                  key={i}
                  style={
                    {
                      "--x": `${Math.cos(i) * 216}px`,
                      "--y": `${Math.sin(i) * 180}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          {played && <p>High Score: {high}</p>}
          <a href={`${import.meta.env.BASE_URL}v1/`}>Open legacy practice ↗</a>
          <p className="rules">
            2 minutes · solve to advance · skip costs 10 seconds
          </p>
        </section>
      ) : phase === "finished" ? (
        <section className="home">
          <p className="eyebrow">TIME'S UP</p>
          <h1>{score}</h1>
          <p>Problems solved</p>
          <p>High Score: {high}</p>
          <button className="start" onClick={start}>
            Play Again
          </button>
          <a href={`${import.meta.env.BASE_URL}v1/`}>Legacy practice ↗</a>
        </section>
      ) : (
        problem && (
          <>
            <header>
              <a href={import.meta.env.BASE_URL}>MIPS Practice</a>
              <span>Score: {score}</span>
              <strong className={remaining < 20 ? "urgent" : ""}>
                {Math.ceil(remaining)}s
              </strong>
            </header>
            <section className="arena">
              <p className="eyebrow">
                {problem.category === "c_snippet_to_mips_easy"
                  ? "TRANSLATE THE GOLD LINES"
                  : "TRACE THE GOLD INSTRUCTIONS"}
              </p>
              <div
                className={`problem pixel ${problem.category === "c_snippet_to_mips_easy" ? "translation-problem" : ""}`}
              >
                {problem.category === "c_snippet_to_mips_easy" ? (
                  <div className="translation-columns">
                    <pre>
                      {problem.cBefore}
                      {"\n"}
                      <mark>{problem.cTarget}</mark>
                      {"\n"}
                      {problem.cAfter}
                    </pre>
                    <aside
                      aria-label="Helpful syscalls"
                      className="syscall-reference"
                    >
                      <table>
                        <caption>SYSCALLS</caption>
                        <thead>
                          <tr>
                            <th scope="col">$v0</th>
                            <th scope="col">Function</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            [1, "print_int"],
                            [4, "print_string"],
                            [5, "read_int"],
                            [8, "read_string"],
                            [11, "print_char"],
                            [12, "read_char"],
                          ].map(([number, name]) => (
                            <tr key={number}>
                              <td>{number}</td>
                              <td>{name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </aside>
                  </div>
                ) : (
                  <>
                    <div className="columns">
                      <pre>{problem.data}</pre>
                      <pre>
                        {".text\n...\n"}
                        <mark>{problem.snippet}</mark>
                        {"\n..."}
                      </pre>
                    </div>
                    {problem.stdin && (
                      <div className="console">
                        Console Input: <code>{problem.stdin}</code>
                        {Array.isArray(problem.answer) && (
                          <small>
                            Reads a token; stores a null terminator, no newline.
                          </small>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className={`answer ${phase === "solved" ? "success" : ""}`}>
                {problem.category === "c_snippet_to_mips_easy" ? (
                  <>
                    <p className="contract">{problem.label}</p>
                    <div className="code-row">
                      <aside className="pixel">
                        <small>BEFORE YOUR CODE</small>
                        <pre>
                          {problem.data}
                          {"\n"}
                          {problem.prefix}
                        </pre>
                      </aside>
                      <textarea
                        ref={input}
                        aria-label="MIPS answer"
                        spellCheck={false}
                        value={source}
                        disabled={phase !== "playing"}
                        onChange={(e) => edit(e.target.value)}
                        placeholder="# Your MIPS code"
                      />
                      <aside className="pixel">
                        <small>AFTER YOUR CODE</small>
                        <pre>{problem.suffix}</pre>
                      </aside>
                    </div>
                  </>
                ) : (
                  <div className="trace-answer pixel">
                    <label>
                      {problem.label}
                      {Array.isArray(problem.answer) ? (
                        <div className="cells">
                          {cells.map((v, i) => (
                            <div key={i}>
                              <small>{i}</small>
                              <input
                                ref={(el) => {
                                  cellRefs.current[i] = el;
                                }}
                                aria-label={`Byte ${i}`}
                                value={v}
                                disabled={phase !== "playing"}
                                maxLength={2}
                                onPaste={(e) => {
                                  e.preventDefault();
                                  const text = e.clipboardData.getData("text");
                                  const tokens = text.match(/\\.|[^\\]/g) ?? [];
                                  const updated = [...cells];
                                  tokens
                                    .slice(0, cells.length - i)
                                    .forEach((token, j) => {
                                      updated[i + j] = token;
                                    });
                                  setCells(updated);
                                  const expected = problem.answer;
                                  if (
                                    Array.isArray(expected) &&
                                    updated.every(
                                      (v, j) => parseCell(v) === expected[j],
                                    )
                                  )
                                    pass();
                                  else
                                    cellRefs.current[
                                      Math.min(
                                        i + tokens.length,
                                        cells.length - 1,
                                      )
                                    ]?.focus();
                                }}
                                onChange={(e) => editCell(i, e.target.value)}
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "ArrowLeft" ||
                                    (e.key === "Backspace" && !v)
                                  ) {
                                    cellRefs.current[i - 1]?.focus();
                                  }
                                  if (e.key === "ArrowRight")
                                    cellRefs.current[i + 1]?.focus();
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <input
                          ref={scalar}
                          aria-label={problem.label}
                          value={source}
                          disabled={phase !== "playing"}
                          onChange={(e) => edit(e.target.value)}
                          autoComplete="off"
                        />
                      )}
                    </label>
                    {Array.isArray(problem.answer) && (
                      <small>
                        One character per cell. Escapes: \0 · \n · \t · \\
                      </small>
                    )}
                  </div>
                )}
              </div>
              <p className="status" role="status">
                {phase === "solved"
                  ? "Correct!"
                  : message || "Checks automatically as you type."}
              </p>
              <button
                className="skip"
                disabled={phase !== "playing"}
                onClick={() => {
                  if (phase !== "playing") return;
                  live.current.deadline -= CONFIG.skipSeconds * 1000;
                  live.current.phase = "skipped";
                  live.current.revision++;
                  live.current.pending = false;
                  setPhase("skipped");
                  const answer =
                    problem.category === "c_snippet_to_mips_easy"
                      ? problem.reference
                      : Array.isArray(problem.answer)
                        ? `${problem.snippet}\n# ${problem.label}: ${problem.answer.map((byte) => (byte === 0 ? "\\0" : byte === 10 ? "\\n" : byte === 9 ? "\\t" : byte === 13 ? "\\r" : byte === 92 ? "\\\\" : String.fromCharCode(byte))).join(" ")}`
                        : `${problem.snippet}\n# ${problem.label}: ${problem.answer}`;
                  setSkipSolution(answer);
                  const expired = live.current.deadline <= performance.now();
                  if (!expired) live.current.deadline += 2000;
                  timer.current = setTimeout(() => {
                    if (live.current.phase === "skipped") {
                      if (expired) finish();
                      else next();
                    }
                  }, 2000);
                }}
              >
                Skip · −10s
              </button>
              {phase === "skipped" && (
                <div className="skip-solution pixel" role="status">
                  <small>INTENDED SOLUTION</small>
                  <pre>{skipSolution}</pre>
                </div>
              )}
            </section>
          </>
        )
      )}
    </main>
  );
}
