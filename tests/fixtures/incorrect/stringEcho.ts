import type { StringEchoParams } from "../../../src/problems/families/stringEcho";
import { EXIT, INFINITE_LOOP, type Fixture } from "../lib";

const echo = (space: number, capacity: number, extra = "") => `.data
text: .space ${space}
.text
main:
  la $a0, text
  li $a1, ${capacity}
  li $v0, 8
  syscall
  la $a0, text
  li $v0, 4
  syscall
${extra}
${EXIT}
`;

export function stringEchoIncorrect(p: StringEchoParams): Fixture[] {
  return [
    // A huge buffer with matching capacity never truncates to N-1 characters.
    { name: "missing truncation", source: echo(400, 400) },
    { name: "wrong string capacity (N+1 for .space N)", source: echo(p.n, p.n + 1) },
    { name: "off-by-one capacity (N-1)", source: echo(p.n, p.n - 1) },
    { name: "extra newline", source: echo(p.n, p.n, "  li $a0, 10\n  li $v0, 11\n  syscall") },
    { name: "infinite loop", source: INFINITE_LOOP },
    {
      name: "manual terminator at offset N",
      source: `.data
text: .space ${p.n}
after: .space 4
.text
main:
  la $a0, text
  li $a1, ${p.n}
  li $v0, 8
  syscall
  la $t0, text
  sb $zero, ${p.n}($t0)
  la $a0, text
  li $v0, 4
  syscall
${EXIT}
`,
    },
  ];
}
