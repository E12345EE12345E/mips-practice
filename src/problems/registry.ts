import { characterPair } from "./families/characterPair";
import { constantArithmetic } from "./families/constantArithmetic";
import { inputArithmetic } from "./families/inputArithmetic";
import { stringEcho } from "./families/stringEcho";
import { toggleCase } from "./families/toggleCase";
import { eraseProblem, type ProblemEntry } from "./types";

/** Registered exercise families. Add a family by appending it here. */
export const PROBLEM_TYPES: readonly ProblemEntry[] = [
  eraseProblem(constantArithmetic),
  eraseProblem(stringEcho),
  eraseProblem(inputArithmetic),
  eraseProblem(characterPair),
  eraseProblem(toggleCase),
];

export function getProblemType(id: string): ProblemEntry | undefined {
  return PROBLEM_TYPES.find((p) => p.id === id);
}

/** The legacy application exclusively consumes this category. */
export const NORMAL_CATEGORY = { id: "c_snippet_to_mips_normal", families: PROBLEM_TYPES } as const;
