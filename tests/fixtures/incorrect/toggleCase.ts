import type { ToggleCaseParams } from "../../../src/problems/families/toggleCase";
import { EXIT, INFINITE_LOOP, type Fixture } from "../lib";

const prologue = (p: ToggleCaseParams, capacity = p.n) => `.data
text: .space ${p.n}
.text
main:
  la $a0, text
  li $a1, ${capacity}
  li $v0, 8
  syscall
  la $t0, text
`;

export function toggleCaseIncorrect(p: ToggleCaseParams): Fixture[] {
  return [
    {
      name: "always-uppercase conversion",
      source: `${prologue(p)}  lbu $t1, ${p.k}($t0)
  addiu $a0, $t1, -32
  li $v0, 11
  syscall
${EXIT}
`,
    },
    {
      name: "always-lowercase conversion",
      source: `${prologue(p)}  lbu $t1, ${p.k}($t0)
  addiu $a0, $t1, 32
  li $v0, 11
  syscall
${EXIT}
`,
    },
    {
      name: "no conversion",
      source: `${prologue(p)}  lbu $a0, ${p.k}($t0)
  li $v0, 11
  syscall
${EXIT}
`,
    },
    {
      name: "wrong index",
      source: `${prologue(p)}  lbu $t1, ${p.k + 1}($t0)
  xori $a0, $t1, 0x20
  li $v0, 11
  syscall
${EXIT}
`,
    },
    {
      name: "prints the whole converted string",
      source: `${prologue(p)}  move $a0, $t0
  li $v0, 4
  syscall
${EXIT}
`,
    },
    {
      name: "wrong string capacity",
      source: `${prologue(p, p.n + 1)}  lbu $t1, ${p.k}($t0)
  xori $a0, $t1, 0x20
  li $v0, 11
  syscall
${EXIT}
`,
    },
    { name: "infinite loop", source: INFINITE_LOOP },
  ];
}
