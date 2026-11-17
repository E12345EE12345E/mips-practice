import type { StringEchoParams } from "../../../src/problems/families/stringEcho";
import { EXIT, type Fixture } from "../lib";

export function stringEchoSolutions(p: StringEchoParams): Fixture[] {
  return [
    {
      name: "syscall 4 echo",
      source: `.data
text: .space ${p.n}
.text
main:
  la $a0, text
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $a0, text
  li $v0, 4
  syscall
${EXIT}
`,
    },
    {
      name: "character loop with larger buffer, returns via jr $ra",
      source: `.data
buf: .space ${p.n + 40}
.text
main:
  la $a0, buf
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $s0, buf
loop:
  lbu $a0, 0($s0)
  beqz $a0, done
  li $v0, 11
  syscall
  addiu $s0, $s0, 1
  b loop
done:
  li $v0, 0
  jr $ra
`,
    },
    {
      name: "second allocation after the buffer",
      source: `.data
text: .space ${p.n}
pad: .word 7, 8
.text
main:
  la $t0, text
  li $t1, ${p.n}
  move $a0, $t0
  move $a1, $t1
  li $v0, 8
  syscall
  move $a0, $t0
  li $v0, 4
  syscall
  li $v0, 17
  li $a0, 0
  syscall
`,
    },
  ];
}
