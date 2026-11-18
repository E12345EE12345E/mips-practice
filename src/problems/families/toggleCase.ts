import { LETTERS, LOWERCASE, UPPERCASE } from "../random";
import type { ProblemType, TestInput } from "../types";
import { CAPACITIES, asciiBytes } from "../shared/oracle";
import { validateTokenInput } from "../shared/input";
import { STRING_SYSCALL_HINT, starterProgram } from "../shared/starter";

export interface ToggleCaseParams {
  n: number;
  /** Zero-based index of the toggled character. */
  k: number;
}

export function toggleChar(c: string): string {
  return c >= "a" && c <= "z" ? c.toUpperCase() : c.toLowerCase();
}

export const toggleCase: ProblemType<ToggleCaseParams> = {
  id: "toggle-case",
  version: 1,
  title: "Toggle the case of one character",
  testCount: 4,

  generateParams(rng) {
    const n = rng.pick(CAPACITIES);
    return { n, k: rng.int(0, n - 2) };
  },

  validateParams(p) {
    if (!(CAPACITIES as readonly number[]).includes(p.n)) throw new Error("n must be one of the allowed capacities");
    if (!Number.isInteger(p.k) || p.k < 0 || p.k > p.n - 2) throw new Error("k must be in [0, n-2]");
  },

  renderBody(p) {
    return [
      `    char text[${p.n}];`,
      `    scanf("%${p.n - 1}s", text);`,
      `    char c = text[${p.k}];`,
      `    if (c >= 'a' && c <= 'z') {`,
      `        printf("%c", c - 'a' + 'A');`,
      `    } else {`,
      `        printf("%c", c - 'A' + 'a');`,
      `    }`,
    ].join("\n");
  },

  describe(p) {
    return {
      title: "Toggle the case of one character",
      instructions: ["Translate this C program into MIPS assembly that produces the same output for any valid input."],
      headers: ["stdio.h"],
      inputConstraints: [
        `Input is one token of letters only (A-Z, a-z) that fits in the array and has at least ${p.k + 1} characters.`,
      ],
      outputDescription: `Prints a single character: text[${p.k}] with its letter case flipped. No other characters are printed.`,
      notes: [
        "Indices are zero-based: text[0] is the first character.",
        `text holds ${p.n} bytes, including the terminating zero byte.`,
        "In ASCII, 'a' - 'A' is 32.",
        STRING_SYSCALL_HINT,
      ],
    };
  },

  starterAssembly(p) {
    return starterProgram({
      intro: [STRING_SYSCALL_HINT, "Print a single character with syscall 11 ($a0 = character)."],
      data: [`text:   .space ${p.n}          # char text[${p.n}]`],
    });
  },

  makePreview(p, rng) {
    return { kind: "string", value: rng.string(rng.int(p.k + 1, p.n - 1), LETTERS) };
  },

  makeTests(p, rng) {
    const cases: TestInput[] = [];
    // Two lowercase and two uppercase targets, shuffled with the hidden RNG.
    const kinds = rng.shuffle([true, true, false, false]);
    for (const lower of kinds) {
      const length = rng.int(p.k + 1, p.n - 1);
      const chars = rng.string(length, LETTERS).split("");
      chars[p.k] = rng.string(1, lower ? LOWERCASE : UPPERCASE);
      cases.push({ kind: "string", value: chars.join("") });
    }
    const lowers = cases.filter((c) => c.kind === "string" && c.value[p.k]! >= "a" && c.value[p.k]! <= "z").length;
    if (lowers !== 2) throw new Error("internal error: toggle-case suite must have two lowercase and two uppercase targets");
    return cases;
  },

  expectedStdout(p, input) {
    if (input.kind !== "string") throw new Error("toggle-case expects string input");
    return asciiBytes(toggleChar(input.value[p.k]!));
  },

  validatePreviewInput(p, text) {
    return validateTokenInput(text, {
      alphabet: /^[A-Za-z]+$/,
      alphabetLabel: "letters",
      minLength: p.k + 1,
      maxLength: p.n - 1,
    });
  },
};
