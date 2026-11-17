import { ALPHANUMERIC } from "../random";
import type { ProblemType, TestInput } from "../types";
import { CAPACITIES, asciiBytes } from "../shared/oracle";
import { validateTokenInput } from "../shared/input";
import { STRING_SYSCALL_HINT, starterProgram } from "../shared/starter";

export interface CharacterPairParams {
  n: number;
  /** First printed index (zero-based). */
  i: number;
  /** Second printed index (zero-based). */
  j: number;
}

export const characterPair: ProblemType<CharacterPairParams> = {
  id: "character-pair",
  version: 1,
  title: "Two indexed characters",
  testCount: 5,

  generateParams(rng) {
    const n = rng.pick(CAPACITIES);
    const i = rng.int(0, n - 2);
    let j = rng.int(0, n - 2);
    while (j === i) j = rng.int(0, n - 2);
    return { n, i, j };
  },

  validateParams(p) {
    if (!(CAPACITIES as readonly number[]).includes(p.n)) throw new Error("n must be one of the allowed capacities");
    for (const k of [p.i, p.j]) {
      if (!Number.isInteger(k) || k < 0 || k > p.n - 2) throw new Error("indices must be in [0, n-2]");
    }
    if (p.i === p.j) throw new Error("indices must be distinct");
  },

  renderBody(p) {
    const m = Math.max(p.i, p.j);
    return [
      `    char text[${p.n}];`,
      `    scanf("%${p.n - 1}s", text);`,
      `    if (strlen(text) <= ${m}) return 0;`,
      `    printf("%c:%c", text[${p.i}], text[${p.j}]);`,
    ].join("\n");
  },

  describe(p) {
    const m = Math.max(p.i, p.j);
    return {
      title: "Two indexed characters",
      instructions: ["Translate this C program into MIPS assembly that produces the same output for any valid input."],
      headers: ["stdio.h", "string.h"],
      inputConstraints: [
        `Input is one token of letters and digits (A-Z, a-z, 0-9), 1 to ${3 * p.n} characters long.`,
        "The input may be shorter or longer than the indices require.",
      ],
      outputDescription: `Prints text[${p.i}], a colon, then text[${p.j}] (in that order), with no trailing newline. If the stored string has ${m} or fewer characters, the program prints nothing and exits successfully.`,
      notes: [
        "Indices are zero-based: text[0] is the first character.",
        `text holds ${p.n} bytes, including the terminating zero byte, so at most ${p.n - 1} characters are stored; longer input is truncated to ${p.n - 1} characters first.`,
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
    const m = Math.max(p.i, p.j);
    return { kind: "string", value: rng.string(rng.int(m + 1, p.n - 1), ALPHANUMERIC) };
  },

  makeTests(p, rng) {
    const m = Math.max(p.i, p.j);
    const make = (length: number): TestInput => ({ kind: "string", value: rng.string(length, ALPHANUMERIC) });
    return [
      make(m + 1), // valid, minimum sufficient
      make(rng.int(m + 1, p.n - 1)), // valid, varied
      make(p.n - 1), // valid, maximum fitting
      make(rng.int(1, m)), // too short
      make(rng.int(p.n, 3 * p.n)), // oversized
    ];
  },

  expectedStdout(p, input) {
    if (input.kind !== "string") throw new Error("character-pair expects string input");
    const stored = input.value.slice(0, p.n - 1);
    return asciiBytes(stored.length <= Math.max(p.i, p.j) ? "" : `${stored[p.i]}:${stored[p.j]}`);
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
