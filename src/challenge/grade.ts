import { assemble } from "../mips/assembler";
import { Machine } from "../mips/machine";
import { TEXT_BASE } from "../mips/limits";
import type { SnippetProblem } from "../problems/snippets";
export function gradeFragment(p: SnippetProblem, source: string) {
  if (!source.trim()) return { passed: false, message: "" };
  const boundary = "__challenge_end";
  if (source.includes(boundary))
    return { passed: false, message: "Reserved label." };
  const assembled = assemble(
    `${p.data}\n${p.prefix}\n${source}\n${boundary}:\n${p.suffix}`,
  );
  if (!assembled.ok)
    return { passed: false, message: assembled.diagnostics[0]?.message ?? "" };
  const target = assembled.program.symbols.find((s) => s.name === boundary)!;
  for (const test of p.cases ?? [
    { stdin: p.stdin, answer: p.answer, output: p.expectedOutput },
  ]) {
    const m = new Machine(assembled.program, {
      input: test.stdin,
      maxInstructions: 10000,
    });
    while (m.status === "running" && TEXT_BASE + m.pc * 4 !== target.address)
      m.step();
    if (m.status !== "running") return { passed: false, message: "" };
    if (typeof test.answer === "number" && m.regs[p.register] !== test.answer)
      return { passed: false, message: "" };
    if (
      p.checks &&
      Object.entries(p.checks).some(([r, v]) => m.regs[Number(r)] !== v)
    )
      return { passed: false, message: "" };
    if (p.memory) {
      const symbol = assembled.program.symbols.find(
        (s) => s.name === p.memory!.label,
      );
      if (
        !symbol ||
        p.memory.bytes.some((v, i) => m.mem.readByte(symbol.address + i) !== v)
      )
        return { passed: false, message: "" };
    }
    m.run();
    if (
      String(m.status) !== "exited" ||
      m.exitCode !== 0 ||
      m.stdoutText !== test.output
    )
      return { passed: false, message: "" };
  }
  return { passed: true, message: "" };
}
