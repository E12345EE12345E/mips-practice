import { assemble } from "../mips/assembler";
import { Machine } from "../mips/machine";
import type { Diagnostic, FaultKind } from "../mips/types";
import { compareOutput } from "./compareOutput";

export interface SuiteCase {
  stdin: string;
  expected: Uint8Array;
}

export type FailureCategory =
  | "assembly error"
  | "output mismatch"
  | "buffer overflow"
  | "invalid access"
  | "execution limit"
  | "runtime fault";

/** Safe summary: never contains hidden inputs, expected output, or traces. */
export interface SuiteResult {
  passed: number;
  total: number;
  failureCategories: Array<{ category: FailureCategory; count: number }>;
  /** Safe, source-located diagnostics (at most a few). */
  messages: string[];
  assemblyDiagnostics: Diagnostic[];
}

export function categorize(kind: FaultKind): FailureCategory {
  switch (kind) {
    case "allocation-escape":
    case "buffer-capacity":
      return "buffer overflow";
    case "invalid-access":
    case "misaligned":
    case "unterminated-string":
    case "unowned-buffer":
    case "invalid-jump":
      return "invalid access";
    case "instruction-limit":
    case "stdout-limit":
      return "execution limit";
    default:
      return "runtime fault";
  }
}

const MAX_MESSAGES = 3;

/**
 * Assemble once, then run each case on a fresh machine. Only the immutable
 * assembled program is shared between cases.
 */
export function runSuite(source: string, cases: SuiteCase[]): SuiteResult {
  const assembled = assemble(source);
  if (!assembled.ok) {
    const first = assembled.diagnostics[0];
    return {
      passed: 0,
      total: cases.length,
      failureCategories: [{ category: "assembly error", count: cases.length }],
      messages: first ? [`Assembly error at line ${first.line}: ${first.message}`] : ["Assembly error"],
      assemblyDiagnostics: assembled.diagnostics,
    };
  }

  const counts = new Map<FailureCategory, number>();
  const messages: string[] = [];
  const note = (category: FailureCategory, message?: string) => {
    counts.set(category, (counts.get(category) ?? 0) + 1);
    if (message && !messages.includes(message) && messages.length < MAX_MESSAGES) messages.push(message);
  };
  let passed = 0;

  for (const testCase of cases) {
    const machine = new Machine(assembled.program, { input: testCase.stdin });
    machine.run();
    if (machine.status === "fault" && machine.fault) {
      const where = machine.fault.line > 0 ? ` at line ${machine.fault.line}` : "";
      note(categorize(machine.fault.kind), `${machine.fault.message}${where}`);
    } else if (machine.exitCode !== 0) {
      note("runtime fault", `Program exited with nonzero status ${machine.exitCode}`);
    } else if (!compareOutput(testCase.expected, machine.stdoutBytes)) {
      note("output mismatch");
    } else {
      passed++;
    }
  }

  return {
    passed,
    total: cases.length,
    failureCategories: [...counts.entries()].map(([category, count]) => ({ category, count })),
    messages,
    assemblyDiagnostics: [],
  };
}
