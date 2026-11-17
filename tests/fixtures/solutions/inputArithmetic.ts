import type { InputArithmeticParams } from "../../../src/problems/families/inputArithmetic";
import { EXIT, opInstr, printInt, printPrefixChars, printPrefixString, prefixData, type Fixture } from "../lib";

const READ = "  li $v0, 5\n  syscall";

export function inputArithmeticSolutions(p: InputArithmeticParams): Fixture[] {
  return [
    {
      name: "straight-line",
      source: `${prefixData(p.withPrefix)}.text
main:
${READ}
  move $t0, $v0
${READ}
  move $t1, $v0
${opInstr(p.op, "$t2", "$t0", "$t1")}
${printPrefixString(p.withPrefix)}
${printInt("$t2")}
${EXIT}
`,
    },
    {
      name: "subroutine with stack frame, returns via jr $ra",
      source: `.text
main:
  addiu $sp, $sp, -8
  sw $ra, 4($sp)
${READ}
  move $s0, $v0
${READ}
  move $a1, $v0
  move $a0, $s0
  jal compute
  move $s1, $v0
${printPrefixChars(p.withPrefix)}
${printInt("$s1")}
  lw $ra, 4($sp)
  addiu $sp, $sp, 8
  li $v0, 0
  jr $ra
compute:
${opInstr(p.op, "$v0", "$a0", "$a1")}
  jr $ra
`,
    },
  ];
}
