import { describe, it, expect } from "vitest";
import {
  translationFamilies,
  tracingFamilies,
} from "../../src/problems/easy/registry";
import { gradeFragment } from "../../src/challenge/grade";
import { assemble } from "../../src/mips/assembler";
import { Machine } from "../../src/mips/machine";
describe("easy translation families", () => {
  for (const f of translationFamilies)
    it(f.id, () => {
      for (const [a, b] of [
        [1, 1],
        [5, 10],
        [19, 2],
      ]) {
        const p = f.generate(a, b);
        expect(gradeFragment(p, p.reference), JSON.stringify(p)).toEqual({
          passed: true,
          message: "",
        });
        expect(gradeFragment(p, "").passed).toBe(false);
        expect(gradeFragment(p, "li $v0, 10\nsyscall").passed).toBe(false);
      }
    });
});
describe("trace oracles", () => {
  for (const f of tracingFamilies)
    it(f.id, () => {
      for (const [a, b] of [
        [1, 1],
        [5, 10],
        [19, 2],
      ]) {
        const p = f.generate(a, b);
        const assembled = assemble(
          `${p.data}\n.text\nmain:\n${p.snippet}\nli $v0, 10\nsyscall`,
        );
        expect(assembled.ok).toBe(true);
        if (!assembled.ok) return;
        const m = new Machine(assembled.program, { input: p.stdin });
        m.run();
        expect(m.fault).toBeNull();
        if (Array.isArray(p.answer)) {
          const address = assembled.program.symbols.find(
            (s) => s.name === "buffer",
          )!.address;
          expect(p.answer.map((_, i) => m.mem.readByte(address + i))).toEqual(
            p.answer,
          );
        } else if (p.label === "values[1]") {
          const address = assembled.program.symbols.find(
            (s) => s.name === "values",
          )!.address;
          expect(m.mem.readWord(address + 4)).toBe(p.answer);
        } else expect(m.regs[p.register]).toBe(p.answer);
      }
    });
});
