import { describe, expect, it } from "vitest";
import { assemble } from "../../src/mips/assembler";
import { Machine } from "../../src/mips/machine";
import { takeSnapshot } from "../../src/mips/snapshot";
import { build, execute, mainWith } from "./helpers";

const readString = (capacity: number, data = "buf: .space 30") =>
  mainWith(`  la $a0, buf\n  li $a1, ${capacity}\n  li $v0, 8\n  syscall\n  la $a0, buf\n  li $v0, 4\n  syscall`, data);

describe("syscall 8 (bounded token read)", () => {
  it("reads a token without a newline and terminates it", () => {
    const m = execute(readString(30), "hello\n");
    expect(m.status).toBe("exited");
    expect(m.stdoutText).toBe("hello");
  });

  it("truncates to capacity-1 characters and leaves the excess available", () => {
    const m = execute(
      mainWith(
        `  la $a0, buf\n  li $a1, 5\n  li $v0, 8\n  syscall\n  la $a0, buf\n  li $v0, 4\n  syscall\n  la $a0, buf\n  li $a1, 20\n  li $v0, 8\n  syscall\n  la $a0, buf\n  li $v0, 4\n  syscall`,
        "buf: .space 30",
      ),
      "abcdefgh",
    );
    expect(m.stdoutText).toBe("abcdefgh".slice(0, 4) + "efgh");
  });

  it("skips leading whitespace and stops at whitespace", () => {
    expect(execute(readString(30), "   \n\t word second\n").stdoutText).toBe("word");
  });

  it("handles n = 1 (zero byte only) and n <= 0 (nothing)", () => {
    const one = execute(readString(1), "abc");
    expect(one.stdoutText).toBe("");
    expect(one.inputCursor).toBe(0);
    const zero = execute(readString(0, "buf: .byte 65, 0"), "abc");
    expect(zero.stdoutText).toBe("A");
    expect(zero.inputCursor).toBe(0);
    const neg = execute(readString(-3), "abc");
    expect(neg.inputCursor).toBe(0);
  });

  it("treats premature EOF as a diagnostic", () => {
    expect(execute(readString(30), "").fault?.kind).toBe("input-exhausted");
    expect(execute(readString(30), "   \n").fault?.kind).toBe("input-exhausted");
  });

  it("accepts N-1 and N, rejects N+1 capacity for .space N, even with short input", () => {
    const n = 10;
    const data = `buf: .space ${n}`;
    expect(execute(readString(n - 1, data), "short").fault).toBeNull();
    expect(execute(readString(n, data), "short").fault).toBeNull();
    const over = execute(readString(n + 1, data), "short");
    expect(over.fault?.kind).toBe("buffer-capacity");
    expect(over.stdoutText).toBe("");
    // nothing was written before the fault, and nothing was clamped
    expect(over.mem.readByte(over.program.allocations[0]!.start)).toBe(0);
  });

  it("handles exactly N-1 input and oversized input", () => {
    const data = "buf: .space 10";
    expect(execute(readString(10, data), "a".repeat(9)).stdoutText).toBe("a".repeat(9));
    expect(execute(readString(10, data), "b".repeat(50)).stdoutText).toBe("b".repeat(9));
  });

  it("detects a manual terminator stored at offset N", () => {
    const m = execute(
      mainWith("  la $t0, buf\n  sb $zero, 10($t0)", "buf: .space 10\nnext: .space 10"),
    );
    expect(m.fault?.kind).toBe("allocation-escape");
  });

  it("detects adjacent overflow when advancing a pointer into the next allocation", () => {
    const m = execute(
      mainWith(
        "  la $t0, buf\n  addiu $t0, $t0, 10\n  li $t1, 65\n  sb $t1, 0($t0)",
        "buf: .space 10\nnext: .space 10",
      ),
    );
    expect(m.fault?.kind).toBe("allocation-escape");
  });

  it("rejects buffers whose ownership cannot be established", () => {
    const m = execute(
      mainWith("  li $a0, 0x10010000\n  li $a1, 5\n  li $v0, 8\n  syscall", "buf: .space 10"),
      "abc",
    );
    expect(m.fault?.kind).toBe("unowned-buffer");
  });

  it("reports missing termination on print string", () => {
    const m = execute(mainWith("  la $a0, buf\n  li $v0, 4\n  syscall", "buf: .byte 65, 66, 67"));
    expect(m.fault?.kind).toBe("unterminated-string");
  });

  it("faults on null string pointers", () => {
    expect(execute(mainWith("  li $a0, 0\n  li $v0, 4\n  syscall")).fault?.kind).toBe("invalid-access");
  });
});

describe("integer and character I/O", () => {
  it("reads one token per syscall 5 and prints integers", () => {
    const m = execute(
      mainWith(
        "  li $v0, 5\n  syscall\n  move $t0, $v0\n  li $v0, 5\n  syscall\n  subu $a0, $t0, $v0\n  li $v0, 1\n  syscall",
      ),
      "12 \n 40",
    );
    expect(m.stdoutText).toBe("-28");
  });

  it("faults on exhausted or malformed integer input", () => {
    expect(execute(mainWith("  li $v0, 5\n  syscall"), "").fault?.kind).toBe("input-exhausted");
    expect(execute(mainWith("  li $v0, 5\n  syscall"), "abc").fault?.kind).toBe("bad-input");
    expect(execute(mainWith("  li $v0, 5\n  syscall"), "99999999999").fault?.kind).toBe("bad-input");
  });

  it("prints characters and preserves exact bytes (no trailing newline)", () => {
    const m = execute(mainWith("  li $a0, 0x41\n  li $v0, 11\n  syscall\n  li $a0, 58\n  li $v0, 11\n  syscall"));
    expect(m.stdoutText).toBe("A:");
  });

  it("rejects unsupported syscalls and caps stdout", () => {
    expect(execute(mainWith("  li $v0, 99\n  syscall")).fault?.kind).toBe("unsupported-syscall");
    const loop = execute(".text\nmain:\n li $a0, 65\n li $v0, 11\nl: syscall\n b l");
    expect(loop.fault?.kind).toBe("stdout-limit");
    expect(loop.stdoutBytes.length).toBe(16 * 1024);
  });
});

describe("snapshots", () => {
  it("reports registers, allocations, provenance and changed flags", () => {
    const result = assemble(mainWith("  la $t0, buf\n  addiu $t0, $t0, 2\n  li $t1, 66\n  sb $t1, 0($t0)", "buf: .space 8\nptr: .word buf"));
    if (!result.ok) throw new Error("assemble");
    const machine = new Machine(result.program);
    const initial = takeSnapshot(machine);
    machine.run();
    const final = takeSnapshot(machine, initial);
    const t0 = final.registers[8]!;
    expect(t0.provenance).toBe(1);
    expect(t0.changed).toBe(true);
    expect(t0.used).toBe(true);
    expect(t0.written).toBe(true);
    expect(final.registers[10]!.used).toBe(false);
    const buf = final.allocations.find((a) => a.labels.includes("buf"))!;
    expect(buf.bytes[2]).toBe(66);
    expect(Array.from(buf.changed)).toEqual([0, 0, 1, 0, 0, 0, 0, 0]);
    const ptr = final.allocations.find((a) => a.labels.includes("ptr"))!;
    expect(ptr.wordProvenance).toEqual([[0, 1]]);
    expect(final.codeLabels.map((c) => c.name)).toContain("main");
    expect(final.status).toBe("exited");
  });

  it("steps source instructions from a fresh state", () => {
    const program = build(".text\nmain:\n  li $t0, 100000\n  blt $t0, $t0, main\n  li $v0, 10\n  syscall");
    const machine = new Machine(program);
    machine.stepSource();
    expect(machine.pc).toBe(2); // li expanded to lui+ori, both executed
    machine.stepSource();
    expect(program.instructions[machine.pc]!.span.line).toBe(5);
  });
});
