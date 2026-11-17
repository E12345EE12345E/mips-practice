import type { CharacterPairParams } from "../../../src/problems/families/characterPair";
import { EXIT, INFINITE_LOOP, type Fixture } from "../lib";

interface Options {
  space?: number;
  capacity?: number;
  first?: number;
  second?: number;
  /** Strings with strlen <= threshold print nothing; `null` disables the check. */
  threshold: number | null;
  extra?: string;
}

function program(p: CharacterPairParams, o: Options): string {
  const space = o.space ?? p.n;
  const capacity = o.capacity ?? p.n;
  const check =
    o.threshold === null
      ? ""
      : `  la $t0, text
  li $t1, 0
len:
  addu $t2, $t0, $t1
  lbu $t3, 0($t2)
  beqz $t3, counted
  addiu $t1, $t1, 1
  b len
counted:
  ble $t1, ${o.threshold}, finish`;
  return `.data
text: .space ${space}
.text
main:
  la $a0, text
  li $a1, ${capacity}
  li $v0, 8
  syscall
${check}
  la $t0, text
  lbu $a0, ${o.first ?? p.i}($t0)
  li $v0, 11
  syscall
  li $a0, 58
  li $v0, 11
  syscall
  lbu $a0, ${o.second ?? p.j}($t0)
  li $v0, 11
  syscall
${o.extra ?? ""}
finish:
${EXIT}
`;
}

export function characterPairIncorrect(p: CharacterPairParams): Fixture[] {
  const m = Math.max(p.i, p.j);
  return [
    { name: "swapped indices", source: program(p, { threshold: m, first: p.j, second: p.i }) },
    { name: "off-by-one length check", source: program(p, { threshold: m + 1 }) },
    { name: "no short-input check", source: program(p, { threshold: null }) },
    { name: "wrong string capacity (N+1 for .space N)", source: program(p, { threshold: m, capacity: p.n + 1 }) },
    { name: "extra newline", source: program(p, { threshold: m, extra: "  li $a0, 10\n  li $v0, 11\n  syscall" }) },
    { name: "infinite loop", source: INFINITE_LOOP },
  ];
}
