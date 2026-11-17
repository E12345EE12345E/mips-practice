import type { PromptSpec } from "../types";

/** Mandatory sentence appended to every prompt, outside the C snippet. */
export const NO_ERROR_CHECKING_SENTENCE = "No error checking is needed outside the stated specifications.";

export interface CProgram {
  /** Complete, compilable program (what **Copy C** copies). */
  full: string;
  /** Headers and `int main(void) {` (collapsible boilerplate). */
  head: string;
  /** The few-line body that always stays visible. */
  body: string;
  /** Final `return 0;` and closing brace. */
  tail: string;
}

/** Wrap a family's body in the shared boilerplate. */
export function renderProgram(spec: Pick<PromptSpec, "headers">, body: string): CProgram {
  const head = [...spec.headers.map((h) => `#include <${h}>`), "int main(void) {"].join("\n");
  const tail = "    return 0;\n}";
  return { full: `${head}\n${body}\n${tail}\n`, head, body, tail };
}

/** Count lexical `printf(` calls (used by generator invariants). */
export function countPrintf(source: string): number {
  return (source.match(/\bprintf\s*\(/g) ?? []).length;
}
