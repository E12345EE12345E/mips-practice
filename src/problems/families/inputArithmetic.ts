import type { ProblemType, TestInput } from "../types";
import { applyOp, asciiBytes, formatResult, printfFormat, type ArithmeticOp } from "../shared/oracle";
import { validateIntegerPair } from "../shared/input";
import { starterProgram } from "../shared/starter";

export interface InputArithmeticParams {
  op: ArithmeticOp;
  withPrefix: boolean;
}

const OPS: readonly ArithmeticOp[] = ["+", "-", "*"];

export const inputArithmetic: ProblemType<InputArithmeticParams> = {
  id: "input-arithmetic",
  version: 1,
  title: "Arithmetic on two input integers",
  testCount: 3,

  generateParams(rng) {
    return { op: rng.pick(OPS), withPrefix: rng.int(0, 1) === 1 };
  },

  validateParams(p) {
    if (!OPS.includes(p.op)) throw new Error("unknown operator");
    if (typeof p.withPrefix !== "boolean") throw new Error("withPrefix must be boolean");
  },

  renderBody(p) {
    return [
      "    int a, b;",
      '    scanf("%d %d", &a, &b);',
      `    printf("${printfFormat(p.withPrefix)}", a ${p.op} b);`,
    ].join("\n");
  },

  describe(p) {
    return {
      title: "Arithmetic on two input integers",
      instructions: ["Translate this C program into MIPS assembly that produces the same output for any valid input."],
      headers: ["stdio.h"],
      inputConstraints: ["Input is two integers from 0 to 99, separated by whitespace."],
      outputDescription: p.withPrefix
        ? 'Prints "Result: " followed by the decimal result, with no trailing newline.'
        : "Prints the decimal result with no trailing newline.",
      notes: [
        "Read each integer with syscall 5 (one token per call; the value arrives in $v0).",
        "Subtraction can produce a negative result, which prints with a leading minus sign.",
      ],
    };
  },

  starterAssembly() {
    return starterProgram({
      intro: ["Read an integer with syscall 5 (result in $v0); print one with syscall 1 ($a0 = value)."],
      data: [],
    });
  },

  makePreview(_p, rng) {
    return { kind: "integers", values: [rng.int(0, 99), rng.int(0, 99)] };
  },

  makeTests(_p, rng) {
    const seen = new Set<string>();
    const tests: TestInput[] = [];
    while (tests.length < 3) {
      const a = rng.int(0, 99);
      const b = rng.int(0, 99);
      const key = `${a},${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tests.push({ kind: "integers", values: [a, b] });
    }
    return tests;
  },

  expectedStdout(p, input) {
    if (input.kind !== "integers") throw new Error("input-arithmetic expects integer input");
    const [a, b] = input.values;
    return asciiBytes(formatResult(p.withPrefix, applyOp(p.op, a, b)));
  },

  validatePreviewInput(_p, text) {
    return validateIntegerPair(text, 0, 99);
  },
};
