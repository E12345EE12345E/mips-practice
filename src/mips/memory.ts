import { DATA_BASE, STACK_BASE, STACK_TOP, LIMITS } from "./limits";
import type { Allocation, FaultKind, Program } from "./types";

/** Raised by checked memory operations; converted to a Fault by the machine. */
export class MachineFault extends Error {
  readonly kind: FaultKind;
  constructor(kind: FaultKind, message: string) {
    super(message);
    this.name = "MachineFault";
    this.kind = kind;
  }
}

const hex = (n: number) => `0x${(n >>> 0).toString(16).padStart(8, "0")}`;

/**
 * Checked, allocation-aware memory. Logical segments map to compact backing
 * arrays; nothing is indexed by a full 32-bit virtual address.
 */
export class Memory {
  readonly data: Uint8Array;
  readonly stack: Uint8Array;
  /** Index 0 is the stack; data allocations start at 1. */
  readonly allocations: Allocation[];
  /** Display names per allocation id (label names, else a directive description). */
  readonly names: string[];
  /** Pointer provenance of aligned words: word address -> allocation id. */
  readonly wordProvenance = new Map<number, number>();
  lowestStackWrite = STACK_TOP;

  constructor(program: Program) {
    this.data = program.data.slice();
    this.stack = new Uint8Array(LIMITS.stackBytes);
    this.allocations = [
      { id: 0, kind: "stack", start: STACK_BASE, length: LIMITS.stackBytes, line: 0, directive: "stack" },
      ...program.allocations,
    ];
    this.names = this.allocations.map((a) => {
      if (a.id === 0) return "stack";
      const labels = program.symbols.filter((s) => s.segment === "data" && s.alloc === a.id).map((s) => s.name);
      return labels.length > 0 ? labels.join(" / ") : `${a.directive} (line ${a.line})`;
    });
    for (const [addr, id] of program.wordProvenance) this.wordProvenance.set(addr, id);
  }

  allocationName(id: number): string {
    return this.names[id] ?? `allocation ${id}`;
  }

  /** Find the allocation that fully contains [addr, addr + size). */
  find(addr: number, size: number): Allocation | null {
    const end = addr + size;
    if (addr >= STACK_BASE && end <= STACK_TOP) return this.allocations[0]!;
    if (addr < DATA_BASE) return null;
    // Binary search over data allocations (sorted by start address).
    let lo = 1;
    let hi = this.allocations.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const a = this.allocations[mid]!;
      if (addr < a.start) hi = mid - 1;
      else if (addr >= a.start + a.length) lo = mid + 1;
      else return end <= a.start + a.length ? a : null;
    }
    return null;
  }

  /**
   * Validate an access of `size` bytes. With known provenance the access must
   * stay inside the originating allocation, even if the numeric address lands in
   * a neighbouring one. Without provenance it must fall in some allocation.
   */
  check(addr: number, size: number, provenance: number): Allocation {
    if (provenance >= 0) {
      const alloc = this.allocations[provenance];
      if (alloc && addr >= alloc.start && addr + size <= alloc.start + alloc.length) return alloc;
      const name = alloc ? this.allocationName(provenance) : "unknown";
      throw new MachineFault(
        "allocation-escape",
        `Access to ${hex(addr)} escapes allocation '${name}'`,
      );
    }
    const found = this.find(addr, size);
    if (!found) {
      throw new MachineFault("invalid-access", `Invalid memory access at ${hex(addr)}`);
    }
    return found;
  }

  private slot(addr: number): { array: Uint8Array; index: number } {
    if (addr >= STACK_BASE && addr < STACK_TOP) return { array: this.stack, index: addr - STACK_BASE };
    const index = addr - DATA_BASE;
    if (addr >= DATA_BASE && index < this.data.length) return { array: this.data, index };
    throw new MachineFault("invalid-access", `Invalid memory access at ${hex(addr)}`);
  }

  readByte(addr: number): number {
    const { array, index } = this.slot(addr);
    return array[index]!;
  }

  writeByte(addr: number, value: number): void {
    const { array, index } = this.slot(addr);
    array[index] = value & 0xff;
    this.wordProvenance.delete(addr & ~3);
    if (array === this.stack && addr < this.lowestStackWrite) this.lowestStackWrite = addr;
  }

  readWord(addr: number): number {
    const { array, index } = this.slot(addr);
    return (array[index]! | (array[index + 1]! << 8) | (array[index + 2]! << 16) | (array[index + 3]! << 24)) | 0;
  }

  writeWord(addr: number, value: number, provenance: number): void {
    const { array, index } = this.slot(addr);
    array[index] = value & 0xff;
    array[index + 1] = (value >>> 8) & 0xff;
    array[index + 2] = (value >>> 16) & 0xff;
    array[index + 3] = (value >>> 24) & 0xff;
    if (provenance >= 0) this.wordProvenance.set(addr, provenance);
    else this.wordProvenance.delete(addr);
    if (array === this.stack && addr < this.lowestStackWrite) this.lowestStackWrite = addr;
  }
}
