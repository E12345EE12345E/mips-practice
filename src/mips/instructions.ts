/**
 * Single source of truth for instruction syntax. The assembler expands source
 * instructions through these definitions, and the editor derives completions
 * and documentation from the same table, so the editor cannot advertise an
 * instruction the assembler rejects.
 *
 * Operand pattern letters (comma-separated):
 *   r  register          i  constant expression (no label)
 *   l  label             m  memory operand: `off(base)`, `label`, `label+k`, `label(base)`, `(base)`
 *   e  any expression (constant or label+constant)
 */
import { REG } from "./registers";
import { AsmError, type Expr, type Op, type Span } from "./types";
import type { Operand } from "./parser";

export interface Proto {
  op: Op;
  rd: number;
  rs: number;
  rt: number;
  imm: number;
  sym?: Expr;
  symKind?: "hi" | "lo" | "branch" | "jump";
}

export interface InstrForm {
  syntax: string;
  pattern: string;
  expand(ops: Operand[], span: Span): Proto[];
}

export interface InstrDef {
  name: string;
  pseudo: boolean;
  summary: string;
  forms: InstrForm[];
}

const AT = REG.at;
const ZERO = REG.zero;

const P = (op: Op, rd = 0, rs = 0, rt = 0, imm = 0, extra?: Partial<Proto>): Proto => ({
  op,
  rd,
  rs,
  rt,
  imm,
  ...extra,
});

const fitsS16 = (v: number) => v >= -32768 && v <= 32767;
const fitsU16 = (v: number) => v >= 0 && v <= 65535;

function reg(o: Operand | undefined): number {
  if (!o || o.kind !== "reg") throw new Error("internal: expected register operand");
  return o.reg;
}

function constant(o: Operand | undefined): number {
  if (!o || o.kind !== "expr") throw new Error("internal: expected constant operand");
  return o.expr.offset;
}

function spanOf(o: Operand | undefined): Span {
  if (!o) throw new Error("internal: missing operand");
  return o.span;
}

function checkRange(o: Operand | undefined, lo: number, hi: number, what: string): number {
  const v = constant(o);
  if (v < lo || v > hi) {
    throw new AsmError(`${what} ${v} is out of range (${lo}..${hi})`, spanOf(o));
  }
  return v;
}

function labelExpr(o: Operand | undefined): Expr {
  if (!o || o.kind !== "expr") throw new Error("internal: expected label operand");
  if (o.expr.offset !== 0) {
    throw new AsmError("Branch and jump targets must be plain labels", o.span);
  }
  return o.expr;
}

/** `li` expansion rule: depends only on the constant, never on labels. */
export function expandLi(rd: number, value: number): Proto[] {
  if (value < -0x80000000 || value > 0xffffffff) {
    throw new Error("internal: li value out of 32-bit range");
  }
  if (fitsS16(value)) return [P("addiu", 0, ZERO, rd, value)];
  if (value >= 0 && value <= 0xffff) return [P("ori", 0, ZERO, rd, value)];
  const u = value >>> 0;
  const hi = u >>> 16;
  const lo = u & 0xffff;
  if (lo === 0) return [P("lui", 0, 0, rd, hi)];
  return [P("lui", 0, 0, rd, hi), P("ori", 0, rd, rd, lo)];
}

function liChecked(rd: number, o: Operand | undefined): Proto[] {
  const v = constant(o);
  if (v < -0x80000000 || v > 0xffffffff) {
    throw new AsmError(`Constant ${v} does not fit in 32 bits`, spanOf(o));
  }
  return expandLi(rd, v);
}

/** Fixed-size `la`: always `lui` + `ori` so forward references cannot shift addresses. */
function expandLa(rd: number, expr: Expr): Proto[] {
  return [
    P("lui", 0, 0, rd, 0, { sym: expr, symKind: "hi" }),
    P("ori", 0, rd, rd, 0, { sym: expr, symKind: "lo" }),
  ];
}

function expandMem(op: "lb" | "lbu" | "lw" | "sb" | "sw", rt: number, o: Operand | undefined): Proto[] {
  if (!o || (o.kind !== "mem" && o.kind !== "expr")) throw new Error("internal: expected memory operand");
  const offset = o.kind === "mem" ? o.offset : o.expr;
  const base = o.kind === "mem" ? o.base : null;

  if (offset.symbol === undefined) {
    if (offset.offset < -0x80000000 || offset.offset > 0xffffffff) {
      throw new AsmError("Address offset does not fit in 32 bits", o.span);
    }
    if (base !== null && fitsS16(offset.offset)) {
      return [P(op, 0, base, rt, offset.offset)];
    }
    const out = expandLi(AT, offset.offset);
    if (base !== null) out.push(P("addu", AT, AT, base));
    out.push(P(op, 0, AT, rt, 0));
    return out;
  }
  const out = expandLa(AT, offset);
  if (base !== null) out.push(P("addu", AT, AT, base));
  out.push(P(op, 0, AT, rt, 0));
  return out;
}

const branch = (op: "beq" | "bne", rs: number, rt: number, target: Expr): Proto =>
  P(op, 0, rs, rt, 0, { sym: target, symKind: "branch" });

const branchZero = (op: "bltz" | "bgez" | "blez" | "bgtz", rs: number, target: Expr): Proto =>
  P(op, 0, rs, 0, 0, { sym: target, symKind: "branch" });

function def(name: string, summary: string, forms: InstrForm[], pseudo = false): InstrDef {
  return { name, pseudo, summary, forms };
}

/** Three-operand arithmetic with a register form and an immediate pseudo-form. */
function arith3(
  name: string,
  summary: string,
  regOp: Op,
  imm: { op: Op; range: "s16" | "u16"; negate?: boolean } | null,
): InstrDef {
  const forms: InstrForm[] = [
    {
      syntax: `${name} rd, rs, rt`,
      pattern: "r,r,r",
      expand: (o) => [P(regOp, reg(o[0]), reg(o[1]), reg(o[2]))],
    },
  ];
  if (imm) {
    forms.push({
      syntax: `${name} rd, rs, imm`,
      pattern: "r,r,i",
      expand: (o) => {
        const rd = reg(o[0]);
        const rs = reg(o[1]);
        const raw = constant(o[2]);
        const value = imm.negate ? -raw : raw;
        const ok = imm.range === "s16" ? fitsS16(value) : fitsU16(value);
        if (ok) return [P(imm.op, 0, rs, rd, value)];
        const out = liChecked(AT, o[2]);
        out.push(P(regOp, rd, rs, AT));
        return out;
      },
    });
  }
  return def(name, summary, forms, imm !== null);
}

function immediateOp(
  name: string,
  summary: string,
  op: Op,
  lo: number,
  hi: number,
): InstrDef {
  return def(name, summary, [
    {
      syntax: `${name} rt, rs, imm`,
      pattern: "r,r,i",
      expand: (o) => [P(op, 0, reg(o[1]), reg(o[0]), checkRange(o[2], lo, hi, "Immediate"))],
    },
  ]);
}

function shiftOp(name: string, summary: string, op: Op): InstrDef {
  return def(name, summary, [
    {
      syntax: `${name} rd, rt, shamt`,
      pattern: "r,r,i",
      expand: (o) => [P(op, reg(o[0]), 0, reg(o[1]), checkRange(o[2], 0, 31, "Shift amount"))],
    },
  ]);
}

function memOp(name: "lb" | "lbu" | "lw" | "sb" | "sw", summary: string): InstrDef {
  return def(name, summary, [
    {
      syntax: `${name} rt, offset(base)`,
      pattern: "r,m",
      expand: (o) => expandMem(name, reg(o[0]), o[1]),
    },
  ]);
}

function zeroBranch(name: string, summary: string, op: "bltz" | "bgez" | "blez" | "bgtz"): InstrDef {
  return def(name, summary, [
    {
      syntax: `${name} rs, label`,
      pattern: "r,l",
      expand: (o) => [branchZero(op, reg(o[0]), labelExpr(o[1]))],
    },
  ]);
}

/** beq/bne with a register or immediate second operand. */
function equalityBranch(name: "beq" | "bne", summary: string): InstrDef {
  return def(name, summary, [
    {
      syntax: `${name} rs, rt, label`,
      pattern: "r,r,l",
      expand: (o) => [branch(name, reg(o[0]), reg(o[1]), labelExpr(o[2]))],
    },
    {
      syntax: `${name} rs, imm, label`,
      pattern: "r,i,l",
      expand: (o) => {
        const v = constant(o[1]);
        if (v === 0) return [branch(name, reg(o[0]), ZERO, labelExpr(o[2]))];
        const out = liChecked(AT, o[1]);
        out.push(branch(name, reg(o[0]), AT, labelExpr(o[2])));
        return out;
      },
    },
  ], true);
}

/** Comparison pseudo-branches (blt, ble, bgt, bge and unsigned variants). */
function compareBranch(name: string, summary: string, kind: "lt" | "le" | "gt" | "ge", unsigned: boolean): InstrDef {
  const sltOp: Op = unsigned ? "sltu" : "slt";
  const sltiOp: Op = unsigned ? "sltiu" : "slti";
  // lt: rs<rt -> slt(rs,rt) != 0     ge: rs>=rt -> slt(rs,rt) == 0
  // gt: rs>rt -> slt(rt,rs) != 0     le: rs<=rt -> slt(rt,rs) == 0
  const swap = kind === "gt" || kind === "le";
  const takeIfSet = kind === "lt" || kind === "gt";
  const finish = (target: Expr, takeWhenSet: boolean): Proto => branch(takeWhenSet ? "bne" : "beq", AT, ZERO, target);

  return def(
    name,
    summary,
    [
      {
        syntax: `${name} rs, rt, label`,
        pattern: "r,r,l",
        expand: (o) => {
          const a = reg(o[0]);
          const b = reg(o[1]);
          return [swap ? P(sltOp, AT, b, a) : P(sltOp, AT, a, b), finish(labelExpr(o[2]), takeIfSet)];
        },
      },
      {
        syntax: `${name} rs, imm, label`,
        pattern: "r,i,l",
        expand: (o) => {
          const c = constant(o[1]);
          // rs <= c  <=>  rs < c+1 ;  rs > c  <=>  !(rs < c+1)
          const plusOne = kind === "le" || kind === "gt";
          const k = plusOne ? c + 1 : c;
          const lo = unsigned ? 0 : -32768;
          const hi = 32767;
          if (k < lo || k > hi) {
            throw new AsmError(
              `Immediate ${c} is out of range for ${name}; load it into a register first`,
              spanOf(o[1]),
            );
          }
          // rs < k is the tested condition: taken for lt/le, inverted for gt/ge.
          return [P(sltiOp, 0, reg(o[0]), AT, k), finish(labelExpr(o[2]), kind === "lt" || kind === "le")];
        },
      },
    ],
    true,
  );
}

export const INSTRUCTIONS: InstrDef[] = [
  // Moves / constants
  def("lui", "Load upper immediate: rt = imm << 16.", [
    {
      syntax: "lui rt, imm",
      pattern: "r,i",
      expand: (o) => [P("lui", 0, 0, reg(o[0]), checkRange(o[1], 0, 65535, "Immediate"))],
    },
  ]),
  def(
    "li",
    "Load a 32-bit constant. One instruction when it fits in 16 bits, else lui (+ ori).",
    [
      {
        syntax: "li rd, imm",
        pattern: "r,i",
        expand: (o) => liChecked(reg(o[0]), o[1]),
      },
    ],
    true,
  ),
  def(
    "la",
    "Load the address of a label (always lui + ori, so addresses never shift).",
    [
      {
        syntax: "la rd, label",
        pattern: "r,e",
        expand: (o) => {
          const op = o[1];
          if (!op || op.kind !== "expr") throw new Error("internal: la operand");
          if (op.expr.symbol === undefined) return liChecked(reg(o[0]), op);
          return expandLa(reg(o[0]), op.expr);
        },
      },
    ],
    true,
  ),
  def(
    "move",
    "Copy a register: rd = rs.",
    [{ syntax: "move rd, rs", pattern: "r,r", expand: (o) => [P("addu", reg(o[0]), reg(o[1]), ZERO)] }],
    true,
  ),
  def("nop", "Do nothing.", [{ syntax: "nop", pattern: "", expand: () => [P("sll", 0, 0, 0, 0)] }], true),
  def(
    "neg",
    "Negate with overflow trap: rd = 0 - rs.",
    [{ syntax: "neg rd, rs", pattern: "r,r", expand: (o) => [P("sub", reg(o[0]), ZERO, reg(o[1]))] }],
    true,
  ),
  def(
    "negu",
    "Negate without trap: rd = 0 - rs.",
    [{ syntax: "negu rd, rs", pattern: "r,r", expand: (o) => [P("subu", reg(o[0]), ZERO, reg(o[1]))] }],
    true,
  ),
  def(
    "not",
    "Bitwise complement: rd = ~rs.",
    [{ syntax: "not rd, rs", pattern: "r,r", expand: (o) => [P("nor", reg(o[0]), reg(o[1]), ZERO)] }],
    true,
  ),

  // Arithmetic
  arith3("add", "Signed add; traps on overflow. Immediate form becomes addi.", "add", { op: "addi", range: "s16" }),
  arith3("addu", "Add without overflow trap. Immediate form becomes addiu.", "addu", { op: "addiu", range: "s16" }),
  arith3("sub", "Signed subtract; traps on overflow. Immediate form becomes addi with -imm.", "sub", {
    op: "addi",
    range: "s16",
    negate: true,
  }),
  arith3("subu", "Subtract without overflow trap.", "subu", { op: "addiu", range: "s16", negate: true }),
  immediateOp("addi", "Add sign-extended 16-bit immediate; traps on overflow.", "addi", -32768, 32767),
  immediateOp("addiu", "Add sign-extended 16-bit immediate; wraps.", "addiu", -32768, 32767),
  arith3("mul", "Low 32 bits of rs * rt (no HI/LO). Immediate form uses $at.", "mul", null),
  def("mult", "Signed 64-bit product into HI:LO.", [
    { syntax: "mult rs, rt", pattern: "r,r", expand: (o) => [P("mult", 0, reg(o[0]), reg(o[1]))] },
  ]),
  def("multu", "Unsigned 64-bit product into HI:LO.", [
    { syntax: "multu rs, rt", pattern: "r,r", expand: (o) => [P("multu", 0, reg(o[0]), reg(o[1]))] },
  ]),
  def("mflo", "Move from LO: rd = LO.", [
    { syntax: "mflo rd", pattern: "r", expand: (o) => [P("mflo", reg(o[0]))] },
  ]),
  def("mfhi", "Move from HI: rd = HI.", [
    { syntax: "mfhi rd", pattern: "r", expand: (o) => [P("mfhi", reg(o[0]))] },
  ]),

  // Bitwise and shifts
  arith3("and", "Bitwise AND. Immediate form becomes andi.", "and", { op: "andi", range: "u16" }),
  arith3("or", "Bitwise OR. Immediate form becomes ori.", "or", { op: "ori", range: "u16" }),
  arith3("xor", "Bitwise XOR. Immediate form becomes xori.", "xor", { op: "xori", range: "u16" }),
  def("nor", "Bitwise NOR: rd = ~(rs | rt).", [
    { syntax: "nor rd, rs, rt", pattern: "r,r,r", expand: (o) => [P("nor", reg(o[0]), reg(o[1]), reg(o[2]))] },
  ]),
  immediateOp("andi", "AND with zero-extended 16-bit immediate.", "andi", 0, 65535),
  immediateOp("ori", "OR with zero-extended 16-bit immediate.", "ori", 0, 65535),
  immediateOp("xori", "XOR with zero-extended 16-bit immediate.", "xori", 0, 65535),
  shiftOp("sll", "Shift left logical by a constant.", "sll"),
  shiftOp("srl", "Shift right logical by a constant.", "srl"),
  shiftOp("sra", "Shift right arithmetic by a constant.", "sra"),

  // Comparisons
  arith3("slt", "Set rd to 1 if rs < rt (signed), else 0.", "slt", { op: "slti", range: "s16" }),
  arith3("sltu", "Set rd to 1 if rs < rt (unsigned), else 0.", "sltu", { op: "sltiu", range: "s16" }),
  immediateOp("slti", "Set rt to 1 if rs < sign-extended immediate (signed).", "slti", -32768, 32767),
  immediateOp("sltiu", "Set rt to 1 if rs < sign-extended immediate (unsigned).", "sltiu", -32768, 32767),

  // Memory
  memOp("lb", "Load byte, sign-extended."),
  memOp("lbu", "Load byte, zero-extended."),
  memOp("lw", "Load 4-byte word (must be 4-byte aligned)."),
  memOp("sb", "Store the low byte of rt."),
  memOp("sw", "Store 4-byte word (must be 4-byte aligned)."),

  // Control flow
  equalityBranch("beq", "Branch if rs == rt. An immediate second operand uses $at."),
  equalityBranch("bne", "Branch if rs != rt. An immediate second operand uses $at."),
  def(
    "beqz",
    "Branch if rs == 0.",
    [
      {
        syntax: "beqz rs, label",
        pattern: "r,l",
        expand: (o) => [branch("beq", reg(o[0]), ZERO, labelExpr(o[1]))],
      },
    ],
    true,
  ),
  def(
    "bnez",
    "Branch if rs != 0.",
    [
      {
        syntax: "bnez rs, label",
        pattern: "r,l",
        expand: (o) => [branch("bne", reg(o[0]), ZERO, labelExpr(o[1]))],
      },
    ],
    true,
  ),
  zeroBranch("bltz", "Branch if rs < 0.", "bltz"),
  zeroBranch("bgez", "Branch if rs >= 0.", "bgez"),
  zeroBranch("blez", "Branch if rs <= 0.", "blez"),
  zeroBranch("bgtz", "Branch if rs > 0.", "bgtz"),
  compareBranch("blt", "Branch if rs < rt (signed). Uses $at.", "lt", false),
  compareBranch("ble", "Branch if rs <= rt (signed). Uses $at.", "le", false),
  compareBranch("bgt", "Branch if rs > rt (signed). Uses $at.", "gt", false),
  compareBranch("bge", "Branch if rs >= rt (signed). Uses $at.", "ge", false),
  compareBranch("bltu", "Branch if rs < rt (unsigned). Uses $at.", "lt", true),
  compareBranch("bleu", "Branch if rs <= rt (unsigned). Uses $at.", "le", true),
  compareBranch("bgtu", "Branch if rs > rt (unsigned). Uses $at.", "gt", true),
  compareBranch("bgeu", "Branch if rs >= rt (unsigned). Uses $at.", "ge", true),
  def(
    "b",
    "Unconditional branch.",
    [{ syntax: "b label", pattern: "l", expand: (o) => [branch("beq", ZERO, ZERO, labelExpr(o[0]))] }],
    true,
  ),
  def("j", "Jump to a label.", [
    {
      syntax: "j label",
      pattern: "l",
      expand: (o) => [P("j", 0, 0, 0, 0, { sym: labelExpr(o[0]), symKind: "jump" })],
    },
  ]),
  def("jal", "Jump and link: $ra = return address.", [
    {
      syntax: "jal label",
      pattern: "l",
      expand: (o) => [P("jal", 0, 0, 0, 0, { sym: labelExpr(o[0]), symKind: "jump" })],
    },
  ]),
  def("jr", "Jump to the address in rs. `jr $ra` at program end exits when $v0 is 0.", [
    { syntax: "jr rs", pattern: "r", expand: (o) => [P("jr", 0, reg(o[0]))] },
  ]),

  // System
  def("syscall", "System call selected by $v0 (see the syscall reference).", [
    { syntax: "syscall", pattern: "", expand: () => [P("syscall")] },
  ]),
];

export const INSTRUCTION_MAP: ReadonlyMap<string, InstrDef> = new Map(INSTRUCTIONS.map((d) => [d.name, d]));

/** Mnemonics that exist in real MIPS but are deliberately unsupported here. */
export const UNSUPPORTED_MNEMONICS = new Set([
  "div",
  "divu",
  "rem",
  "remu",
  "mtlo",
  "mthi",
  "lh",
  "lhu",
  "sh",
  "sllv",
  "srlv",
  "srav",
  "jalr",
  "break",
  "eret",
  "mfc0",
  "mtc0",
  "lwc1",
  "swc1",
  "add.s",
  "sub.s",
  "mul.s",
  "div.s",
  "abs",
  "ulw",
  "usw",
  "seq",
  "sne",
  "sgt",
  "sge",
  "sle",
]);

function matchesLetter(letter: string, o: Operand): boolean {
  switch (letter) {
    case "r":
      return o.kind === "reg";
    case "i":
      return o.kind === "expr" && o.expr.symbol === undefined;
    case "l":
      return o.kind === "expr" && o.expr.symbol !== undefined;
    case "m":
      return o.kind === "mem" || o.kind === "expr";
    case "e":
      return o.kind === "expr";
    default:
      return false;
  }
}

export function matchForm(def: InstrDef, ops: Operand[]): InstrForm | null {
  for (const form of def.forms) {
    const letters = form.pattern === "" ? [] : form.pattern.split(",");
    if (letters.length !== ops.length) continue;
    if (letters.every((l, i) => matchesLetter(l, ops[i]!))) return form;
  }
  return null;
}

/** Expand a source instruction into normalized prototypes. Throws AsmError. */
export function expandInstruction(mnemonic: string, ops: Operand[], span: Span): Proto[] {
  const d = INSTRUCTION_MAP.get(mnemonic);
  if (!d) {
    if (UNSUPPORTED_MNEMONICS.has(mnemonic)) {
      throw new AsmError(`Instruction '${mnemonic}' is not supported by this lab (see the dialect reference)`, span);
    }
    throw new AsmError(`Unknown instruction '${mnemonic}'`, span);
  }
  const form = matchForm(d, ops);
  if (!form) {
    const usage = d.forms.map((f) => `'${f.syntax}'`).join(" or ");
    throw new AsmError(`Invalid operands for '${mnemonic}'; expected ${usage}`, span);
  }
  return form.expand(ops, span);
}
