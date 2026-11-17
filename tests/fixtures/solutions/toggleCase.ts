import type { ToggleCaseParams } from "../../../src/problems/families/toggleCase";
import { EXIT, type Fixture } from "../lib";

export function toggleCaseSolutions(p: ToggleCaseParams): Fixture[] {
  return [
    {
      name: "range test and branch",
      source: `.data
text: .space ${p.n}
.text
main:
  la $a0, text
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $t0, text
  lbu $t1, ${p.k}($t0)
  blt $t1, 97, upper
  bgt $t1, 122, upper
  addiu $a0, $t1, -32
  b show
upper:
  addiu $a0, $t1, 32
show:
  li $v0, 11
  syscall
${EXIT}
`,
    },
    {
      name: "xori 0x20, returns via jr $ra",
      source: `.data
text: .space ${p.n}
.text
main:
  la $a0, text
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $t0, text
  lbu $t1, ${p.k}($t0)
  xori $a0, $t1, 0x20
  li $v0, 11
  syscall
  li $v0, 0
  jr $ra
`,
    },
    {
      name: "bit test on the 0x20 flag with larger buffer",
      source: `.data
text: .space ${p.n + 30}
.text
main:
  la $a0, text
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $s0, text
  lb $t0, ${p.k}($s0)
  andi $t1, $t0, 32
  beqz $t1, lowerit
  addi $a0, $t0, -32
  b out
lowerit:
  addi $a0, $t0, 32
out:
  li $v0, 11
  syscall
  li $v0, 17
  li $a0, 0
  syscall
`,
    },
  ];
}
