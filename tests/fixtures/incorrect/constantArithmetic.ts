import type { ConstantArithmeticParams } from "../../../src/problems/families/constantArithmetic";
import { EXIT, INFINITE_LOOP, opInstr, otherOp, printInt, printPrefixString, prefixData, type Fixture } from "../lib";

export function constantArithmeticIncorrect(p: ConstantArithmeticParams): Fixture[] {
  const base = (body: string, withPrefix = p.withPrefix, op = p.op) => `${prefixData(withPrefix)}.text
main:
  li $t0, ${p.a}
  li $t1, ${p.b}
${opInstr(op, "$t2", "$t0", "$t1")}
${body.replace("__PREFIX__", printPrefixString(withPrefix))}
${EXIT}
`;
  const out = [
    { name: "wrong prefix", source: base(`__PREFIX__\n${printInt("$t2")}`, !p.withPrefix) },
    { name: "wrong operator", source: base(`__PREFIX__\n${printInt("$t2")}`, p.withPrefix, otherOp(p.op)) },
    {
      name: "extra newline",
      source: base(`__PREFIX__\n${printInt("$t2")}\n  li $a0, 10\n  li $v0, 11\n  syscall`),
    },
    { name: "off by one", source: base(`__PREFIX__\n  addiu $t2, $t2, 1\n${printInt("$t2")}`) },
    { name: "infinite loop", source: INFINITE_LOOP },
    { name: "nonzero exit status", source: base(`__PREFIX__\n${printInt("$t2")}\n  li $v0, 17\n  li $a0, 1\n  syscall`) },
  ];
  if (p.op === "-") {
    out.push({
      name: "reversed subtraction",
      source: `${prefixData(p.withPrefix)}.text
main:
  li $t0, ${p.a}
  li $t1, ${p.b}
  subu $t2, $t1, $t0
${printPrefixString(p.withPrefix)}
${printInt("$t2")}
${EXIT}
`,
    });
  }
  return out as Fixture[];
}
