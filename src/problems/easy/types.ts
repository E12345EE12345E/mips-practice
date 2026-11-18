export type EasyCategory =
  "c_snippet_to_mips_easy" | "mips_snippet_behavior_tracing_easy";
export interface EasyProblem {
  id: string;
  family: string;
  category: EasyCategory;
  cBefore: string;
  cTarget: string;
  cAfter: string;
  data: string;
  prefix: string;
  suffix: string;
  snippet: string;
  stdin: string;
  label: string;
  answer: number | number[];
  checks?: Record<number, number>;
  memory?: { label: string; bytes: number[] };
  cases?: { stdin: string; answer: number; output: string }[];
  reference: string;
  expectedOutput: string;
  register: number;
}
export type Family = {
  id: string;
  generate(a: number, b: number): EasyProblem;
};
export const base = (family: string, a: number, b: number): EasyProblem => ({
  id: `${family}:${a}:${b}`,
  family,
  category: "c_snippet_to_mips_easy",
  cBefore: "int main() {\n    int a, b;",
  cTarget: "",
  cAfter: '    printf("%d", a);\n    return 0;\n}',
  data: ".data",
  prefix: ".text\n.globl main\nmain:",
  suffix: "move $a0, $t0\nli $v0, 1\nsyscall\nli $v0, 10\nsyscall",
  snippet: "",
  stdin: "",
  label: "a → $t0 · b → $t1 · scratch: $t2–$t7",
  answer: 0,
  reference: "",
  expectedOutput: "",
  register: 8,
});
