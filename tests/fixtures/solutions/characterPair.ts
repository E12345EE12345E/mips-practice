import type { CharacterPairParams } from "../../../src/problems/families/characterPair";
import { EXIT, type Fixture } from "../lib";

const printChar = (reg: string) => `  move $a0, ${reg}\n  li $v0, 11\n  syscall`;

export function characterPairSolutions(p: CharacterPairParams): Fixture[] {
  const m = Math.max(p.i, p.j);
  return [
    {
      name: "strlen loop then compare",
      source: `.data
text: .space ${p.n}
.text
main:
  la $a0, text
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $t0, text
  li $t1, 0
len:
  addu $t2, $t0, $t1
  lbu $t3, 0($t2)
  beqz $t3, counted
  addiu $t1, $t1, 1
  b len
counted:
  ble $t1, ${m}, finish
  lbu $t4, ${p.i}($t0)
  lbu $t5, ${p.j}($t0)
${printChar("$t4")}
  li $a0, 58
  li $v0, 11
  syscall
${printChar("$t5")}
finish:
${EXIT}
`,
    },
    {
      name: "tests the byte at the largest index, returns via jr $ra",
      source: `.data
text: .space ${p.n}
.text
main:
  la $s0, text
  move $a0, $s0
  li $a1, ${p.n}
  li $v0, 8
  syscall
  lbu $t0, ${m}($s0)
  beq $t0, $zero, quit
  lbu $a0, ${p.i}($s0)
  li $v0, 11
  syscall
  li $a0, ':'
  li $v0, 11
  syscall
  lbu $a0, ${p.j}($s0)
  li $v0, 11
  syscall
quit:
  li $v0, 0
  jr $ra
`,
    },
    {
      name: "larger buffer, slt based check",
      source: `.data
text: .space ${p.n + 64}
.text
main:
  la $a0, text
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $t0, text
  addiu $t0, $t0, ${m}
  lbu $t1, 0($t0)
  sltiu $t2, $t1, 1
  bnez $t2, out
  la $t0, text
  lb $t3, ${p.i}($t0)
  lb $t4, ${p.j}($t0)
  li $v0, 11
  move $a0, $t3
  syscall
  li $a0, 58
  syscall
  move $a0, $t4
  syscall
out:
  li $v0, 17
  li $a0, 0
  syscall
`,
    },
  ];
}
