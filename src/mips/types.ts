/** Engine contracts shared by the assembler, machine, workers, and UI. */

export interface Span {
  /** 1-based line. */
  line: number;
  /** 1-based start column. */
  col: number;
  /** 1-based exclusive end column. */
  endCol: number;
}

export type Severity = "error" | "warning";

export interface Diagnostic extends Span {
  severity: Severity;
  message: string;
}

/** Thrown by lexer/parser/assembler internals; collected into diagnostics. */
export class AsmError extends Error {
  readonly span: Span;
  constructor(message: string, span: Span) {
    super(message);
    this.name = "AsmError";
    this.span = span;
  }
}

/** Address expression: optional symbol plus constant offset. */
export interface Expr {
  symbol?: string;
  offset: number;
  span: Span;
}

export const OPS = [
  "add",
  "addu",
  "addi",
  "addiu",
  "sub",
  "subu",
  "mul",
  "div",
  "mult",
  "multu",
  "mflo",
  "mfhi",
  "and",
  "andi",
  "or",
  "ori",
  "xor",
  "xori",
  "nor",
  "sll",
  "srl",
  "sra",
  "slt",
  "sltu",
  "slti",
  "sltiu",
  "lui",
  "lb",
  "lbu",
  "lw",
  "sb",
  "sw",
  "beq",
  "bne",
  "bltz",
  "bgez",
  "blez",
  "bgtz",
  "j",
  "jal",
  "jr",
  "syscall",
] as const;

export type Op = (typeof OPS)[number];

/** One normalized (post-expansion) instruction. */
export interface Instr {
  op: Op;
  rd: number;
  rs: number;
  rt: number;
  /** Resolved immediate (sign/zero extension is chosen per op). */
  imm: number;
  /** Branch/jump target as a normalized instruction index. */
  target: number;
  /** `lui` of a symbol address: allocation id for provenance, or -1. */
  alloc: number;
  /** Original source span (shared by all instructions of an expansion). */
  span: Span;
  /** Index of the source-level instruction this belongs to. */
  group: number;
  /** Normalized index of the first instruction in this group. */
  groupStart: number;
  /** Number of normalized instructions in this group. */
  groupLength: number;
}

export type SegmentKind = "data" | "stack";

export interface Allocation {
  /** 0 is the stack; data allocations are numbered from 1. */
  id: number;
  kind: SegmentKind;
  start: number;
  length: number;
  /** Declaring source line (0 for the stack). */
  line: number;
  /** Directive that created it. */
  directive: string;
}

export interface SymbolInfo {
  name: string;
  segment: "text" | "data";
  address: number;
  /** Allocation id when a data symbol marks the start of storage. */
  alloc: number;
  line: number;
}

export interface Program {
  instructions: Instr[];
  data: Uint8Array;
  allocations: Allocation[];
  symbols: SymbolInfo[];
  /** Initial pointer provenance of `.word label` initializers: address -> allocation id. */
  wordProvenance: Array<[number, number]>;
  /** Instruction index of `main`. */
  entry: number;
  /** Number of source-level instruction groups. */
  groupCount: number;
}

export type AssembleResult =
  | { ok: true; program: Program; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export type FaultKind =
  | "invalid-access"
  | "allocation-escape"
  | "buffer-capacity"
  | "misaligned"
  | "arithmetic-overflow"
  | "unsupported-syscall"
  | "input-exhausted"
  | "bad-input"
  | "invalid-jump"
  | "unterminated-string"
  | "bad-exit-status"
  | "instruction-limit"
  | "stdout-limit"
  | "unowned-buffer";

export interface Fault {
  kind: FaultKind;
  message: string;
  /** Source line of the faulting instruction, or 0 when unknown. */
  line: number;
  /** Normalized instruction index, or -1. */
  pc: number;
}

export type MachineStatus = "running" | "exited" | "fault";

export type TerminationReason = "syscall-10" | "syscall-17" | "return";

export interface TraceEntry {
  line: number;
  pc: number;
}
