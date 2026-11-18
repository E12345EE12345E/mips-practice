import { HOST_RETURN, INITIAL_SP, LIMITS, TEXT_BASE } from "./limits";
import { MachineFault, Memory } from "./memory";
import { REG } from "./registers";
import { executeSyscall } from "./syscalls";
import type { Fault, FaultKind, Instr, MachineStatus, Program, TerminationReason, TraceEntry } from "./types";

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

const addProvenance = (pa: number, pb: number) => (pa >= 0 && pb < 0 ? pa : pb >= 0 && pa < 0 ? pb : -1);
const subProvenance = (pa: number, pb: number) => (pa >= 0 && pb < 0 ? pa : -1);

export interface MachineOptions {
  input?: string;
  maxInstructions?: number;
  maxStdoutBytes?: number;
}

export class Machine {
  readonly program: Program;
  readonly mem: Memory;
  readonly regs = new Int32Array(32);
  /** Per-register address provenance: allocation id, or -1 for plain integers. */
  readonly provenance = new Int32Array(32).fill(-1);
  /** 1 if the register was read or written during this run (not ABI init). */
  readonly usedRegs = new Uint8Array(32);
  /** 1 if the register was written, including ABI init of $sp/$ra. */
  readonly writtenRegs = new Uint8Array(32);
  hi = 0;
  lo = 0;
  hiUsed = false;
  loUsed = false;
  hiWritten = false;
  loWritten = false;
  /** Normalized instruction index of the next instruction. */
  pc: number;
  status: MachineStatus = "running";
  fault: Fault | null = null;
  exitCode: number | null = null;
  termination: TerminationReason | null = null;
  instructionCount = 0;
  readonly trace: TraceEntry[] = [];

  readonly input: string;
  inputCursor = 0;
  private readonly stdout: Uint8Array;
  private stdoutLength = 0;
  private readonly maxInstructions: number;

  constructor(program: Program, options: MachineOptions = {}) {
    this.program = program;
    this.mem = new Memory(program);
    this.pc = program.entry;
    this.input = options.input ?? "";
    this.maxInstructions = options.maxInstructions ?? LIMITS.maxInstructions;
    this.stdout = new Uint8Array(options.maxStdoutBytes ?? LIMITS.maxStdoutBytes);
    this.regs[REG.sp] = INITIAL_SP;
    this.provenance[REG.sp] = 0; // the stack allocation
    this.writtenRegs[REG.sp] = 1;
    this.regs[REG.ra] = HOST_RETURN;
    this.writtenRegs[REG.ra] = 1;
  }

  /** Bytes written to stdout so far (copy). */
  get stdoutBytes(): Uint8Array {
    return this.stdout.slice(0, this.stdoutLength);
  }

  get stdoutText(): string {
    let s = "";
    for (let i = 0; i < this.stdoutLength; i++) s += String.fromCharCode(this.stdout[i]!);
    return s;
  }

  /** Append a byte to stdout; faults at the output limit. */
  writeStdout(byte: number): void {
    if (this.stdoutLength >= this.stdout.length) {
      throw new MachineFault("stdout-limit", `Output exceeds the ${this.stdout.length}-byte limit`);
    }
    this.stdout[this.stdoutLength++] = byte & 0xff;
  }

  /** Mark register `r` as read. $zero is ignored so it stays hidden unless shown unused. */
  touchReg(r: number): void {
    if (r === 0) return;
    this.usedRegs[r] = 1;
  }

  /** Read a GPR and mark it used (except $zero). */
  readReg(r: number): number {
    this.touchReg(r);
    return this.regs[r]!;
  }

  /** Write a GPR (also marks it used). $zero is ignored. */
  writeReg(r: number, value: number, prov = -1): void {
    this.setReg(r, value, prov);
  }

  private setReg(r: number, value: number, prov = -1): void {
    if (r === 0) return;
    this.usedRegs[r] = 1;
    this.writtenRegs[r] = 1;
    this.regs[r] = value;
    this.provenance[r] = prov;
  }

  private writeHi(value: number): void {
    this.hi = value;
    this.hiUsed = true;
    this.hiWritten = true;
  }

  private writeLo(value: number): void {
    this.lo = value;
    this.loUsed = true;
    this.loWritten = true;
  }

  setFault(kind: FaultKind, message: string, instr?: Instr): void {
    const at = instr ?? this.program.instructions[this.pc];
    this.status = "fault";
    this.fault = { kind, message, line: at ? at.span.line : 0, pc: at ? this.pc : -1 };
  }

  exit(code: number, reason: TerminationReason): void {
    this.status = "exited";
    this.exitCode = code | 0;
    this.termination = reason;
  }

  /** Execute exactly one normalized instruction. */
  step(): void {
    if (this.status !== "running") return;
    const instrs = this.program.instructions;
    const instr = instrs[this.pc];
    if (!instr) {
      this.setFault("invalid-jump", "Execution ran past the end of the program (missing exit)");
      return;
    }
    if (this.instructionCount >= this.maxInstructions) {
      this.setFault("instruction-limit", `Instruction limit of ${this.maxInstructions} reached`, instr);
      return;
    }
    this.instructionCount++;
    if (instr.groupStart === this.pc) {
      this.trace.push({ line: instr.span.line, pc: this.pc });
      if (this.trace.length > LIMITS.maxTraceEntries) this.trace.shift();
    }
    try {
      this.execute(instr);
    } catch (e) {
      if (e instanceof MachineFault) {
        this.setFault(e.kind, e.message, instr);
      } else {
        throw e;
      }
    }
  }

  /** Execute the remaining normalized instructions of the current source instruction. */
  stepSource(): void {
    const instr = this.program.instructions[this.pc];
    if (!instr) {
      this.step();
      return;
    }
    const first = instr.groupStart;
    const last = first + instr.groupLength - 1;
    do {
      this.step();
    } while (this.status === "running" && this.pc > first && this.pc <= last);
  }

  /** Run up to `n` instructions; returns true when the machine stopped. */
  runChunk(n: number): boolean {
    for (let i = 0; i < n && this.status === "running"; i++) this.step();
    return this.status !== "running";
  }

  /** Run to completion synchronously (tests, grader). */
  run(): void {
    while (this.status === "running") this.runChunk(LIMITS.chunkSize);
  }

  private memAddress(instr: Instr): number {
    return (this.regs[instr.rs]! + instr.imm) >>> 0;
  }

  private markSources(i: Instr): void {
    switch (i.op) {
      case "add":
      case "addu":
      case "sub":
      case "subu":
      case "mul":
      case "and":
      case "or":
      case "xor":
      case "nor":
      case "slt":
      case "sltu":
      case "beq":
      case "bne":
      case "sb":
      case "sw":
        this.touchReg(i.rs);
        this.touchReg(i.rt);
        return;
      case "addi":
      case "addiu":
      case "andi":
      case "ori":
      case "xori":
      case "slti":
      case "sltiu":
      case "lb":
      case "lbu":
      case "lw":
      case "bltz":
      case "bgez":
      case "blez":
      case "bgtz":
      case "jr":
        this.touchReg(i.rs);
        return;
      case "sll":
      case "srl":
      case "sra":
        this.touchReg(i.rt);
        return;
      case "mult":
      case "multu":
        this.touchReg(i.rs);
        this.touchReg(i.rt);
        return;
      case "mflo":
        this.loUsed = true;
        return;
      case "mfhi":
        this.hiUsed = true;
        return;
      case "lui":
      case "j":
      case "jal":
      case "syscall":
        return;
      default: {
        const _never: never = i.op;
        return _never;
      }
    }
  }

  private execute(i: Instr): void {
    const regs = this.regs;
    const prov = this.provenance;
    this.markSources(i);
    const a = regs[i.rs]!;
    const b = regs[i.rt]!;
    let next = this.pc + 1;

    switch (i.op) {
      case "add": {
        const r = a + b;
        if (r > INT_MAX || r < INT_MIN) throw new MachineFault("arithmetic-overflow", "Signed overflow in add");
        this.setReg(i.rd, r, addProvenance(prov[i.rs]!, prov[i.rt]!));
        break;
      }
      case "addu":
        this.setReg(i.rd, (a + b) | 0, addProvenance(prov[i.rs]!, prov[i.rt]!));
        break;
      case "addi": {
        const r = a + i.imm;
        if (r > INT_MAX || r < INT_MIN) throw new MachineFault("arithmetic-overflow", "Signed overflow in addi");
        this.setReg(i.rt, r, prov[i.rs]!);
        break;
      }
      case "addiu":
        this.setReg(i.rt, (a + i.imm) | 0, prov[i.rs]!);
        break;
      case "sub": {
        const r = a - b;
        if (r > INT_MAX || r < INT_MIN) throw new MachineFault("arithmetic-overflow", "Signed overflow in sub");
        this.setReg(i.rd, r, subProvenance(prov[i.rs]!, prov[i.rt]!));
        break;
      }
      case "subu":
        this.setReg(i.rd, (a - b) | 0, subProvenance(prov[i.rs]!, prov[i.rt]!));
        break;
      case "mul":
        this.setReg(i.rd, Math.imul(a, b));
        break;
      case "mult": {
        const p = BigInt(a) * BigInt(b);
        this.writeLo(Number(BigInt.asIntN(32, p)));
        this.writeHi(Number(BigInt.asIntN(32, p >> 32n)));
        break;
      }
      case "multu": {
        const p = BigInt(a >>> 0) * BigInt(b >>> 0);
        this.writeLo(Number(BigInt.asIntN(32, p)));
        this.writeHi(Number(BigInt.asIntN(32, p >> 32n)));
        break;
      }
      case "mflo":
        this.setReg(i.rd, this.lo);
        break;
      case "mfhi":
        this.setReg(i.rd, this.hi);
        break;
      case "and":
        this.setReg(i.rd, a & b);
        break;
      case "andi":
        this.setReg(i.rt, a & i.imm);
        break;
      case "or":
        this.setReg(i.rd, a | b);
        break;
      case "ori":
        // Preserves provenance so the `la` expansion (lui + ori) keeps its tag.
        this.setReg(i.rt, a | i.imm, prov[i.rs]!);
        break;
      case "xor":
        this.setReg(i.rd, a ^ b);
        break;
      case "xori":
        this.setReg(i.rt, a ^ i.imm);
        break;
      case "nor":
        this.setReg(i.rd, ~(a | b));
        break;
      case "sll":
        this.setReg(i.rd, b << i.imm);
        break;
      case "srl":
        this.setReg(i.rd, (b >>> i.imm) | 0);
        break;
      case "sra":
        this.setReg(i.rd, b >> i.imm);
        break;
      case "slt":
        this.setReg(i.rd, a < b ? 1 : 0);
        break;
      case "sltu":
        this.setReg(i.rd, a >>> 0 < b >>> 0 ? 1 : 0);
        break;
      case "slti":
        this.setReg(i.rt, a < i.imm ? 1 : 0);
        break;
      case "sltiu":
        this.setReg(i.rt, a >>> 0 < i.imm >>> 0 ? 1 : 0);
        break;
      case "lui":
        this.setReg(i.rt, i.imm << 16, i.alloc);
        break;
      case "lb":
      case "lbu": {
        const addr = this.memAddress(i);
        this.mem.check(addr, 1, prov[i.rs]!);
        const byte = this.mem.readByte(addr);
        this.setReg(i.rt, i.op === "lb" ? (byte << 24) >> 24 : byte);
        break;
      }
      case "lw": {
        const addr = this.memAddress(i);
        if (addr & 3) throw new MachineFault("misaligned", `Unaligned word load at 0x${addr.toString(16)}`);
        this.mem.check(addr, 4, prov[i.rs]!);
        this.setReg(i.rt, this.mem.readWord(addr), this.mem.wordProvenance.get(addr) ?? -1);
        break;
      }
      case "sb": {
        const addr = this.memAddress(i);
        this.mem.check(addr, 1, prov[i.rs]!);
        this.mem.writeByte(addr, b);
        break;
      }
      case "sw": {
        const addr = this.memAddress(i);
        if (addr & 3) throw new MachineFault("misaligned", `Unaligned word store at 0x${addr.toString(16)}`);
        this.mem.check(addr, 4, prov[i.rs]!);
        this.mem.writeWord(addr, b, prov[i.rt]!);
        break;
      }
      case "beq":
        if (a === b) next = i.target;
        break;
      case "bne":
        if (a !== b) next = i.target;
        break;
      case "bltz":
        if (a < 0) next = i.target;
        break;
      case "bgez":
        if (a >= 0) next = i.target;
        break;
      case "blez":
        if (a <= 0) next = i.target;
        break;
      case "bgtz":
        if (a > 0) next = i.target;
        break;
      case "j":
        next = i.target;
        break;
      case "jal":
        this.setReg(REG.ra, TEXT_BASE + (this.pc + 1) * 4);
        next = i.target;
        break;
      case "jr": {
        const addr = a >>> 0;
        if (addr === HOST_RETURN) {
          this.touchReg(REG.v0);
          this.exit(regs[REG.v0]!, "return");
          return;
        }
        const index = (addr - TEXT_BASE) / 4;
        if (addr < TEXT_BASE || !Number.isInteger(index) || index >= this.program.instructions.length) {
          throw new MachineFault("invalid-jump", `Jump to invalid address 0x${addr.toString(16)}`);
        }
        next = index;
        break;
      }
      case "syscall":
        executeSyscall(this);
        break;
    }
    if (this.status === "running") this.pc = next;
  }
}

/** Convenience: assemble-free helper used by tests and the grader. */
export function runProgram(program: Program, options: MachineOptions = {}): Machine {
  const machine = new Machine(program, options);
  machine.run();
  return machine;
}
