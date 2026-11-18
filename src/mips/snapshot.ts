import { DATA_BASE, STACK_BASE, STACK_TOP, TEXT_BASE } from "./limits";
import type { Machine } from "./machine";
import { REGISTER_NAMES } from "./registers";
import type { Fault, MachineStatus, SegmentKind, TraceEntry } from "./types";

/** Maximum bytes of a single allocation included in a snapshot. */
export const SNAPSHOT_MAX_BYTES = 4096;
const MIN_STACK_VIEW = 16;
const MAX_STACK_VIEW = 512;

export interface RegisterView {
  index: number;
  name: string;
  value: number;
  /** Allocation id the value is tracked as pointing into, or -1. */
  provenance: number;
  changed: boolean;
  /** Read or written during this run (ABI init of $sp/$ra does not count). */
  used: boolean;
  /** Written, including ABI init of $sp/$ra. $zero is treated as defined. */
  written: boolean;
}

export interface AllocationView {
  id: number;
  kind: SegmentKind;
  labels: string[];
  start: number;
  /** Full allocation length (bytes may be truncated). */
  length: number;
  line: number;
  directive: string;
  bytes: Uint8Array;
  /** 1 where the byte differs from the baseline snapshot. */
  changed: Uint8Array;
  truncated: boolean;
  /** Tracked pointer words: [byte offset, target allocation id]. */
  wordProvenance: Array<[number, number]>;
}

export interface CodeLabelView {
  name: string;
  address: number;
  line: number;
}

/** Presentation-neutral machine state. */
export interface Snapshot {
  registers: RegisterView[];
  hi: number;
  lo: number;
  hiChanged: boolean;
  loChanged: boolean;
  hiUsed: boolean;
  loUsed: boolean;
  hiWritten: boolean;
  loWritten: boolean;
  /** Address of the next instruction. */
  pc: number;
  /** Source line of the next instruction, or 0. */
  pcLine: number;
  allocations: AllocationView[];
  codeLabels: CodeLabelView[];
  stdout: string;
  status: MachineStatus;
  fault: Fault | null;
  exitCode: number | null;
  instructionCount: number;
  trace: TraceEntry[];
  /** Number of normalized instructions in the program. */
  textLength: number;
}

function byteAt(view: AllocationView | undefined, address: number): number {
  if (!view) return 0;
  const offset = address - view.start;
  if (offset < 0 || offset >= view.bytes.length) return 0;
  return view.bytes[offset]!;
}

/**
 * Capture the machine state. `baseline` supplies the comparison point for
 * changed-value flags (the initial state for final views, the previous step for
 * stepping). Only allocation extents are copied; never the full backing store.
 */
export function takeSnapshot(machine: Machine, baseline?: Snapshot): Snapshot {
  const { program, mem } = machine;

  const registers: RegisterView[] = [];
  for (let i = 0; i < 32; i++) {
    const value = machine.regs[i]!;
    registers.push({
      index: i,
      name: `$${REGISTER_NAMES[i]}`,
      value,
      provenance: machine.provenance[i]!,
      changed: baseline ? baseline.registers[i]!.value !== value : false,
      used: machine.usedRegs[i] === 1,
      written: i === 0 || machine.writtenRegs[i] === 1,
    });
  }

  const allocations: AllocationView[] = [];

  for (const alloc of mem.allocations) {
    if (alloc.kind === "stack") continue;
    const shown = Math.min(alloc.length, SNAPSHOT_MAX_BYTES);
    const bytes = new Uint8Array(shown);
    const offset = alloc.start - DATA_BASE;
    bytes.set(mem.data.subarray(offset, offset + shown));
    const old = baseline?.allocations.find((a) => a.id === alloc.id);
    const changed = new Uint8Array(shown);
    if (baseline) {
      for (let k = 0; k < shown; k++) if (byteAt(old, alloc.start + k) !== bytes[k]) changed[k] = 1;
    }
    const wordProvenance: Array<[number, number]> = [];
    for (const [addr, target] of mem.wordProvenance) {
      if (addr >= alloc.start && addr + 4 <= alloc.start + alloc.length) wordProvenance.push([addr - alloc.start, target]);
    }
    allocations.push({
      id: alloc.id,
      kind: "data",
      labels: program.symbols.filter((s) => s.segment === "data" && s.alloc === alloc.id).map((s) => s.name),
      start: alloc.start,
      length: alloc.length,
      line: alloc.line,
      directive: alloc.directive,
      bytes,
      changed,
      truncated: shown < alloc.length,
      wordProvenance,
    });
  }

  // Stack view: from the lowest touched address up to the top, bounded.
  const sp = machine.regs[29]! >>> 0;
  let lowest = mem.lowestStackWrite;
  if (sp >= STACK_BASE && sp < STACK_TOP) lowest = Math.min(lowest, sp);
  const stackStart = Math.min(lowest & ~3, STACK_TOP - MIN_STACK_VIEW);
  const stackLength = Math.min(STACK_TOP - stackStart, MAX_STACK_VIEW);
  const stackBytes = new Uint8Array(stackLength);
  const stackOffset = stackStart - STACK_BASE;
  stackBytes.set(mem.stack.subarray(stackOffset, stackOffset + stackLength));
  const oldStack = baseline?.allocations.find((a) => a.id === 0);
  const stackChanged = new Uint8Array(stackLength);
  if (baseline) {
    for (let k = 0; k < stackLength; k++) if (byteAt(oldStack, stackStart + k) !== stackBytes[k]) stackChanged[k] = 1;
  }
  const stackProv: Array<[number, number]> = [];
  for (const [addr, target] of mem.wordProvenance) {
    if (addr >= stackStart && addr + 4 <= stackStart + stackLength) stackProv.push([addr - stackStart, target]);
  }
  allocations.push({
    id: 0,
    kind: "stack",
    labels: ["stack"],
    start: stackStart,
    length: STACK_TOP - stackStart,
    line: 0,
    directive: "stack",
    bytes: stackBytes,
    changed: stackChanged,
    truncated: stackLength < STACK_TOP - stackStart,
    wordProvenance: stackProv,
  });

  const next = program.instructions[machine.pc];
  return {
    registers,
    hi: machine.hi,
    lo: machine.lo,
    hiChanged: baseline ? baseline.hi !== machine.hi : false,
    loChanged: baseline ? baseline.lo !== machine.lo : false,
    hiUsed: machine.hiUsed,
    loUsed: machine.loUsed,
    hiWritten: machine.hiWritten,
    loWritten: machine.loWritten,
    pc: TEXT_BASE + machine.pc * 4,
    pcLine: machine.status === "running" && next ? next.span.line : 0,
    allocations,
    codeLabels: program.symbols
      .filter((s) => s.segment === "text")
      .map((s) => ({ name: s.name, address: s.address, line: s.line })),
    stdout: machine.stdoutText,
    status: machine.status,
    fault: machine.fault,
    exitCode: machine.exitCode,
    instructionCount: machine.instructionCount,
    trace: machine.trace.slice(),
    textLength: program.instructions.length,
  };
}
