import type { ProblemType } from "../types";
import { applyOp, asciiBytes, formatResult, printfFormat, type ArithmeticOp } from "../shared/oracle";
import { starterProgram } from "../shared/starter";

export interface ConstantArithmeticParams {
  a: number;
  b: number;
  op: ArithmeticOp;
  withPrefix: boolean;
}

const OPS: readonly ArithmeticOp[] = ["+", "-", "*"];

export const constantArithmetic: ProblemType<ConstantArithmeticParams> = {
  id: "constant-arithmetic",
  version: 1,
  title: "Literal arithmetic",
  testCount: 1,

  generateParams(rng) {
    return {
      a: rng.int(10, 99),
      b: rng.int(10, 99),
      op: rng.pick(OPS),
      withPrefix: rng.int(0, 1) === 1,
    };
  },

  validateParams(p) {
    if (!Number.isInteger(p.a) || p.a < 10 || p.a > 99) throw new Error("a must be in [10, 99]");
    if (!Number.isInteger(p.b) || p.b < 10 || p.b > 99) throw new Error("b must be in [10, 99]");
    if (!OPS.includes(p.op)) throw new Error("unknown operator");
    if (typeof p.withPrefix !== "boolean") throw new Error("withPrefix must be boolean");
  },

  renderBody(p) {
    return [
      `    int a = ${p.a}, b = ${p.b};`,
      `    printf("${printfFormat(p.withPrefix)}", a ${p.op} b);`,
    ].join("\n");
  },

  describe(p) {
    return {
      title: "Literal arithmetic",
      instructions: ["Translate this C program into MIPS assembly that produces the same output."],
      headers: ["stdio.h"],
      inputConstraints: ["The program reads no input."],
      outputDescription: p.withPrefix
        ? 'Prints "Result: " followed by the decimal result, with no trailing newline.'
        : "Prints the decimal result with no trailing newline.",
      notes: ["Negative results print with a leading minus sign."],
    };
  },

  starterAssembly() {
    return starterProgram({
      intro: ["Print integers with syscall 1 ($a0 = value) and strings with syscall 4 ($a0 = address)."],
      data: [],
    });
  },

  makePreview() {
    return { kind: "none" };
  },

  makeTests() {
    return [{ kind: "none" }];
  },

  expectedStdout(p) {
    return asciiBytes(formatResult(p.withPrefix, applyOp(p.op, p.a, p.b)));
  },

  validatePreviewInput(_p, text) {
    return text.trim() === "" ? null : "This program reads no input.";
  },
};
