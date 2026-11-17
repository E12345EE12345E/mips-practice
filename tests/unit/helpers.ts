import { assemble } from "../../src/mips/assembler";
import { Machine, type MachineOptions } from "../../src/mips/machine";
import type { Program } from "../../src/mips/types";

export function build(source: string): Program {
  const result = assemble(source);
  if (!result.ok) {
    throw new Error(
      "assembly failed: " + result.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join("; "),
    );
  }
  return result.program;
}

export function execute(source: string, input = "", options: MachineOptions = {}): Machine {
  const m = new Machine(build(source), { input, ...options });
  m.run();
  return m;
}

/** Wrap instructions in a `main` that exits via syscall 10. */
export function mainWith(body: string, data = ""): string {
  return `${data ? `.data\n${data}\n` : ""}.text\nmain:\n${body}\n  li $v0, 10\n  syscall\n`;
}

export function reg(m: Machine, n: number): number {
  return m.regs[n]!;
}

export function errorsOf(source: string): string[] {
  const result = assemble(source);
  return result.ok ? [] : result.diagnostics.map((d) => d.message);
}
