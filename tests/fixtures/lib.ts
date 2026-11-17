import type { ArithmeticOp } from "../../src/problems/shared/oracle";

export interface Fixture {
  name: string;
  source: string;
}

export const EXIT = "  li $v0, 10\n  syscall";

export function opInstr(op: ArithmeticOp, dst: string, a: string, b: string): string {
  switch (op) {
    case "+":
      return `  addu ${dst}, ${a}, ${b}`;
    case "-":
      return `  subu ${dst}, ${a}, ${b}`;
    case "*":
      return `  mul ${dst}, ${a}, ${b}`;
  }
}

export function otherOp(op: ArithmeticOp): ArithmeticOp {
  return op === "+" ? "-" : "+";
}

/** Print "Result: " via syscall 4 (needs the `prefix` label from prefixData). */
export function printPrefixString(withPrefix: boolean): string {
  return withPrefix ? "  la $a0, prefix\n  li $v0, 4\n  syscall" : "";
}

export function prefixData(withPrefix: boolean): string {
  return withPrefix ? '.data\nprefix: .asciiz "Result: "\n' : "";
}

/** Print "Result: " one character at a time with syscall 11. */
export function printPrefixChars(withPrefix: boolean): string {
  if (!withPrefix) return "";
  return [...("Result: ")]
    .map((c) => `  li $a0, ${c.charCodeAt(0)}\n  li $v0, 11\n  syscall`)
    .join("\n");
}

export function printInt(reg: string): string {
  return `  move $a0, ${reg}\n  li $v0, 1\n  syscall`;
}

export const INFINITE_LOOP = ".text\nmain:\nspin:\n  b spin\n";
