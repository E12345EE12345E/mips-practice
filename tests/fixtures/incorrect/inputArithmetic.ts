import type { InputArithmeticParams } from "../../../src/problems/families/inputArithmetic";
import { EXIT, INFINITE_LOOP, opInstr, otherOp, printInt, printPrefixString, prefixData, type Fixture } from "../lib";

const READ = "  li $v0, 5\n  syscall";

export function inputArithmeticIncorrect(p: InputArithmeticParams): Fixture[] {
  const program = (opts: { withPrefix?: boolean; op?: typeof p.op; swap?: boolean; extra?: string; oneRead?: boolean }) => {
    const withPrefix = opts.withPrefix ?? p.withPrefix;
    const op = opts.op ?? p.op;
    const [x, y] = opts.swap ? ["$t1", "$t0"] : ["$t0", "$t1"];
    return `${prefixData(withPrefix)}.text
main:
${READ}
  move $t0, $v0
${opts.oneRead ? "  li $v0, 0\n  move $t1, $zero" : `${READ}\n  move $t1, $v0`}
${opInstr(op, "$t2", x, y)}
${printPrefixString(withPrefix)}
${printInt("$t2")}
${opts.extra ?? ""}
${EXIT}
`;
  };
  const out: Fixture[] = [
    { name: "wrong prefix", source: program({ withPrefix: !p.withPrefix }) },
    { name: "wrong operator", source: program({ op: otherOp(p.op) }) },
    { name: "extra newline", source: program({ extra: "  li $a0, 10\n  li $v0, 11\n  syscall" }) },
    { name: "reads only one integer", source: program({ oneRead: true }) },
    { name: "infinite loop", source: INFINITE_LOOP },
  ];
  if (p.op === "-") out.push({ name: "reversed subtraction", source: program({ swap: true }) });
  return out;
}
