import { describe, it, expect } from "vitest";
import {
  translationFamilies,
  tracingFamilies,
  generateProblem,
} from "../../src/problems/easy/registry";
import { normalTranslationFamilies } from "../../src/problems/normal/registry";
import { LEGACY_CATEGORY } from "../../src/problems/registry";
import { gradeFragment } from "../../src/challenge/grade";
import { assemble } from "../../src/mips/assembler";
import { Machine } from "../../src/mips/machine";
import { matchesScalarAnswer } from "../../src/challenge/App";
describe("speedrun tracing prompts", () => {
  const family = (id: string) => tracingFamilies.find((item) => item.id === id);
  it("explains the initial bytes before the array declaration", () => {
    for (const id of ["store_newline_in_array", "insert_null_terminator"]) {
      const problem = family(id)!.generate(1, 1);
      expect(problem.data).toContain("# 97:a  98:b  99:c  0:\\0\nbuffer: .byte");
    }
  });
  it("omits character stores and accepts either answer format for pointer loads", () => {
    expect(family("store_one_char_in_array")).toBeUndefined();
    const problem = family("advance_char_pointer_load")!.generate(2, 1);
    expect(matchesScalarAnswer(problem, "c")).toBe(true);
    expect(matchesScalarAnswer(problem, "99")).toBe(true);
    expect(matchesScalarAnswer(problem, "b")).toBe(false);
    expect(matchesScalarAnswer(problem, "C")).toBe(false);
  });
});
describe("translation references", () => {
  for (const f of [...translationFamilies, ...normalTranslationFamilies])
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
describe("minimal executed instruction requirements", () => {
  const problem = (id: string, a: number, b: number) =>
    translationFamilies.find((f) => f.id === id)!.generate(a, b);
  it("rejects constant-only arithmetic and unexecuted instructions", () => {
    const p = problem("update_one_int", 10, 12);
    expect(gradeFragment(p, "li $t0, 22").passed).toBe(false);
    expect(gradeFragment(p, "li $t0, 22 # add $t0, $t0, $t1").passed).toBe(false);
    expect(gradeFragment(p, "b done\nadd $t0, $t0, $t1\ndone:\nli $t0, 22").passed).toBe(false);
    expect(gradeFragment(p, "answer: addiu $t0, $t0, 12").passed).toBe(true);
    const compound = problem("set_two_ints_perform_op", 5, 10);
    expect(gradeFragment(compound, `li $t0, ${compound.answer}`).passed).toBe(false);
    expect(gradeFragment(compound, compound.reference).passed).toBe(true);
  });
  it("requires division results to be read even when the initial value matches", () => {
    for (const [id, a, b, read] of [
      ["divide_two_ints_quotient", 10, 1, "mflo"],
      ["divide_two_ints_remainder", 5, 12, "mfhi"],
    ] as const) {
      const p = problem(id, a, b);
      expect(gradeFragment(p, "div $t0, $t1").passed).toBe(false);
      expect(gradeFragment(p, `div $t0, $t1\n${read} $t0`).passed).toBe(true);
    }
    const p = problem("divide_two_ints_remainder", 19, 2);
    expect(gradeFragment(p, "div $t0, $t1\nmfhi $t2").passed).toBe(false);
    expect(gradeFragment(p, "div $t0, $t1\nmfhi $t2\nmove $t0, $t2").passed).toBe(true);
  });
});
describe("translation difficulty pools", () => {
  it("keeps easy references short except the requested two-int arithmetic family", () => {
    const ids = [...translationFamilies, ...normalTranslationFamilies].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [families, category, maximum] of [
      [translationFamilies, "c_snippet_to_mips_easy", 3],
      [normalTranslationFamilies, "c_snippet_to_mips_normal", Infinity],
    ] as const) {
      for (const family of families) {
        for (let a = 1; a <= 19; a++) {
          for (let b = 1; b <= 19; b++) {
            const problem = family.generate(a, b);
            const lines = problem.reference.split("\n").filter((line) => line.trim()).length;
            expect(problem.category).toBe(category);
            if (family.id === "set_two_ints_perform_op") {
              expect(category).toBe("c_snippet_to_mips_easy");
              expect(lines).toBe(5);
            } else expect(lines).toBeLessThanOrEqual(maximum);
            if (category === "c_snippet_to_mips_normal") expect(lines).toBeGreaterThan(3);
          }
        }
      }
    }
  });
  it("reserves the four longer families and excludes them from speedruns", () => {
    expect(normalTranslationFamilies.map((f) => f.id)).toEqual([
      "set_three_ints_perform_op",
      "counted_sum_loop",
      "read_two_ints",
      "read_bounded_string",
    ]);
    expect(translationFamilies.some((f) => f.id === "set_two_ints_perform_op")).toBe(true);
    for (let i = 0; i < 100; i++) {
      const problem = generateProblem(i);
      expect(problem.category).toBe(i % 2 === 0
        ? "c_snippet_to_mips_easy"
        : "mips_snippet_behavior_tracing_easy");
      expect(normalTranslationFamilies.some((f) => f.id === problem.family)).toBe(false);
    }
    expect(LEGACY_CATEGORY.id).toBe("c_snippet_to_mips_legacy");
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
