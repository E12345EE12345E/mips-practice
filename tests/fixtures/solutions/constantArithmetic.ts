import type { ConstantArithmeticParams } from "../../../src/problems/families/constantArithmetic";
import { applyOp } from "../../../src/problems/shared/oracle";
import { EXIT, opInstr, printInt, printPrefixChars, printPrefixString, prefixData, type Fixture } from "../lib";

export function constantArithmeticSolutions(p: ConstantArithmeticParams): Fixture[] {
  const result = applyOp(p.op, p.a, p.b);
  return [
    {
      name: "computes at run time",
      source: `${prefixData(p.withPrefix)}.text
main:
  li $t0, ${p.a}
  li $t1, ${p.b}
${opInstr(p.op, "$t2", "$t0", "$t1")}
${printPrefixString(p.withPrefix)}
${printInt("$t2")}
${EXIT}
`,
    },
    {
      // Printing a precomputed correct answer passes under the output-based rule.
      name: "precomputed constant, returns via jr $ra",
      source: `.text
main:
${printPrefixChars(p.withPrefix)}
  li $a0, ${result}
  li $v0, 1
  syscall
  li $v0, 0
  jr $ra
`,
    },
    {
      name: "uses saved registers and exit with status 0",
      source: `.text
main:
  addiu $sp, $sp, -4
  li $s0, ${p.a}
  sw $s0, 0($sp)
  li $s1, ${p.b}
  lw $s0, 0($sp)
${opInstr(p.op, "$s2", "$s0", "$s1")}
${printPrefixChars(p.withPrefix)}
${printInt("$s2")}
  addiu $sp, $sp, 4
  li $v0, 17
  li $a0, 0
  syscall
`,
    },
  ];
}
