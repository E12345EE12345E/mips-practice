import type { RandomSource } from "./random";

export type TestInput =
  | { kind: "none" }
  | { kind: "integers"; values: [number, number] }
  | { kind: "string"; value: string };

export interface PromptSpec {
  title: string;
  /** Short task statement(s). */
  instructions: string[];
  /** Standard headers required by the C program, e.g. "stdio.h". */
  headers: string[];
  inputConstraints: string[];
  outputDescription: string;
  /** Family-specific notes, such as the zero-based index explanation. */
  notes: string[];
}

export interface ProblemType<P> {
  id: string;
  version: number;
  title: string;
  /** Exact number of hidden tests this family must generate. */
  testCount: number;
  generateParams(rng: RandomSource): P;
  /** Throws if the parameters are outside the family's domain. */
  validateParams(params: P): void;
  /** C statements inside `main`, up to and including the single `printf`. */
  renderBody(params: P): string;
  describe(params: P): PromptSpec;
  starterAssembly(params: P): string;
  makePreview(params: P, rng: RandomSource): TestInput;
  makeTests(params: P, rng: RandomSource): TestInput[];
  /** Independent oracle: never derived from the rendered C text. */
  expectedStdout(params: P, input: TestInput): Uint8Array;
  /** Check user-edited preview stdin against the input domain; null when valid. */
  validatePreviewInput(params: P, text: string): string | null;
}

/** Parameter-erased view of a problem family, used by the registry and app. */
export interface ProblemEntry {
  id: string;
  version: number;
  title: string;
  testCount: number;
  generateParams(rng: RandomSource): unknown;
  validateParams(params: unknown): void;
  renderBody(params: unknown): string;
  describe(params: unknown): PromptSpec;
  starterAssembly(params: unknown): string;
  makePreview(params: unknown, rng: RandomSource): TestInput;
  makeTests(params: unknown, rng: RandomSource): TestInput[];
  expectedStdout(params: unknown, input: TestInput): Uint8Array;
  validatePreviewInput(params: unknown, text: string): string | null;
}

export function eraseProblem<P>(type: ProblemType<P>): ProblemEntry {
  return {
    id: type.id,
    version: type.version,
    title: type.title,
    testCount: type.testCount,
    generateParams: (rng) => {
      const params = type.generateParams(rng);
      type.validateParams(params);
      return params;
    },
    validateParams: (params) => type.validateParams(params as P),
    renderBody: (params) => type.renderBody(params as P),
    describe: (params) => type.describe(params as P),
    starterAssembly: (params) => type.starterAssembly(params as P),
    makePreview: (params, rng) => type.makePreview(params as P, rng),
    makeTests: (params, rng) => type.makeTests(params as P, rng),
    expectedStdout: (params, input) => type.expectedStdout(params as P, input),
    validatePreviewInput: (params, text) => type.validatePreviewInput(params as P, text),
  };
}
