import { ALPHANUMERIC } from "../random";
import type { ProblemType, TestInput } from "../types";
import { CAPACITIES, asciiBytes } from "../shared/oracle";
import { validateTokenInput } from "../shared/input";
import { STRING_SYSCALL_HINT, starterProgram } from "../shared/starter";

export interface StringEchoParams {
  n: number;
}

export const stringEcho: ProblemType<StringEchoParams> = {
  id: "string-echo",
  version: 1,
  title: "Bounded string echo",
  testCount: 3,

  generateParams(rng) {
    return { n: rng.pick(CAPACITIES) };
  },

  validateParams(p) {
    if (!(CAPACITIES as readonly number[]).includes(p.n)) throw new Error("n must be one of the allowed capacities");
  },

  renderBody(p) {
    return [
      `    char text[${p.n}];`,
      `    scanf("%${p.n - 1}s", text);`,
      `    printf("%s", text);`,
    ].join("\n");
  },

  describe(p) {
    return {
      title: "Bounded string echo",
      instructions: ["Translate this C program into MIPS assembly that produces the same output for any valid input."],
      headers: ["stdio.h"],
      inputConstraints: [
        `Input is one token of letters and digits (A-Z, a-z, 0-9), 1 to ${3 * p.n} characters long.`,
        "The input may be longer than the array.",
      ],
      outputDescription: "Prints the stored string with no trailing newline.",
      notes: [
        `text holds ${p.n} bytes, including the terminating zero byte, so at most ${p.n - 1} characters are stored.`,
        `"%${p.n - 1}s" stops after ${p.n - 1} characters: longer input is truncated, never written past the array.`,
        STRING_SYSCALL_HINT,
      ],
    };
  },

  starterAssembly(p) {
    return starterProgram({
      intro: [STRING_SYSCALL_HINT],
      data: [`text:   .space ${p.n}          # char text[${p.n}]`],
    });
  },

  makePreview(p, rng) {
    return { kind: "string", value: rng.string(rng.int(1, p.n - 1), ALPHANUMERIC) };
  },

  makeTests(p, rng) {
    const make = (length: number): TestInput => ({ kind: "string", value: rng.string(length, ALPHANUMERIC) });
    return [make(rng.int(1, p.n - 2)), make(p.n - 1), make(rng.int(p.n, 3 * p.n))];
  },

  expectedStdout(p, input) {
    if (input.kind !== "string") throw new Error("string-echo expects string input");
    return asciiBytes(input.value.slice(0, p.n - 1));
  },

  validatePreviewInput(p, text) {
    return validateTokenInput(text, {
      alphabet: /^[A-Za-z0-9]+$/,
      alphabetLabel: "letters and digits",
      minLength: 1,
      maxLength: 3 * p.n,
    });
  },
};
