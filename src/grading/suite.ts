import { deriveStream, type Seed } from "../problems/random";
import { inputToStdin } from "../problems/shared/input";
import type { ProblemEntry, TestInput } from "../problems/types";
import type { SuiteCase } from "./runSuite";

export interface HiddenSuite {
  cases: SuiteCase[];
  inputs: TestInput[];
}

/**
 * Build the hidden suite for a problem. The exact case count is validated: a
 * wrong generator count is an internal error, never silently accepted.
 */
export function buildSuite(entry: ProblemEntry, params: unknown, hiddenSeed: Seed): HiddenSuite {
  entry.validateParams(params);
  const inputs = entry.makeTests(params, deriveStream(hiddenSeed, `tests:${entry.id}:v${entry.version}`));
  if (inputs.length !== entry.testCount) {
    throw new Error(
      `internal error: ${entry.id} generated ${inputs.length} tests but requires exactly ${entry.testCount}`,
    );
  }
  return {
    inputs,
    cases: inputs.map((input) => ({
      stdin: inputToStdin(input),
      expected: entry.expectedStdout(params, input),
    })),
  };
}
