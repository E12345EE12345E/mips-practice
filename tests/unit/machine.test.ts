import { describe, expect, it } from "vitest";
import { HOST_RETURN } from "../../src/mips/limits";
import { execute, mainWith, reg } from "./helpers";

const T0 = 8;
const T1 = 9;
const T2 = 10;
const LO_HI_PROG = (op: string, a: number, b: number) =>
  mainWith(`  li $t0, ${a}\n  li $t1, ${b}\n  ${op} $t0, $t1\n  mflo $t2\n  mfhi $t3`);

describe("arithmetic semantics", () => {
  it("traps signed overflow but wraps unsigned", () => {
    const trap = execute(mainWith("  li $t0, 2147483647\n  addi $t1, $t0, 1"));
    expect(trap.fault?.kind).toBe("arithmetic-overflow");
    const wrap = execute(mainWith("  li $t0, 2147483647\n  addiu $t1, $t0, 1"));
    expect(wrap.status).toBe("exited");
    expect(reg(wrap, T1)).toBe(-2147483648);
    expect(execute(mainWith("  li $t0, 2147483647\n  li $t1, 1\n  add $t2, $t0, $t1")).fault?.kind).toBe(
      "arithmetic-overflow",
    );
    expect(execute(mainWith("  li $t0, -2147483648\n  li $t1, 1\n  sub $t2, $t0, $t1")).fault?.kind).toBe(
      "arithmetic-overflow",
    );
    expect(reg(execute(mainWith("  li $t0, -2147483648\n  li $t1, 1\n  subu $t2, $t0, $t1")), T2)).toBe(2147483647);
  });

  it("extends immediates correctly", () => {
    const m = execute(
      mainWith(`  addiu $t0, $zero, -1
  ori $t1, $zero, 0xFFFF
  andi $t2, $t0, 0xFF00
  lui $t3, 0x8000
  sltiu $t4, $zero, -1
  slti $t5, $zero, -1`),
    );
    expect(reg(m, T0)).toBe(-1);
    expect(reg(m, T1)).toBe(65535);
    expect(reg(m, T2)).toBe(0xff00);
    expect(reg(m, 11)).toBe(-2147483648);
    expect(reg(m, 12)).toBe(1); // 0 < 0xFFFFFFFF unsigned
    expect(reg(m, 13)).toBe(0); // 0 < -1 is false signed
  });

  it("shifts logically and arithmetically", () => {
    const m = execute(
      mainWith(`  li $t0, -16
  sra $t1, $t0, 2
  srl $t2, $t0, 28
  sll $t3, $t0, 1`),
    );
    expect(reg(m, T1)).toBe(-4);
    expect(reg(m, T2)).toBe(15);
    expect(reg(m, 11)).toBe(-32);
  });

  it("compares signed and unsigned", () => {
    const m = execute(
      mainWith(`  li $t0, -1
  li $t1, 1
  slt $t2, $t0, $t1
  sltu $t3, $t0, $t1`),
    );
    expect(reg(m, T2)).toBe(1);
    expect(reg(m, 11)).toBe(0);
  });

  it("computes exact 64-bit HI/LO", () => {
    const signed = execute(LO_HI_PROG("mult", -2, 3));
    expect([reg(signed, T2), reg(signed, 11)]).toEqual([-6, -1]);
    const big = execute(LO_HI_PROG("mult", 2147483647, 2147483647));
    // (2^31-1)^2 = 0x3FFFFFFF00000001
    expect([reg(big, 11), reg(big, T2)]).toEqual([0x3fffffff, 1]);
    const unsigned = execute(LO_HI_PROG("multu", -1, -1));
    // 0xFFFFFFFF^2 = 0xFFFFFFFE00000001
    expect([reg(unsigned, 11) >>> 0, reg(unsigned, T2)]).toEqual([0xfffffffe, 1]);
    const mul = execute(mainWith("  li $t0, 99\n  li $t1, 99\n  mul $t2, $t0, $t1"));
    expect(reg(mul, T2)).toBe(9801);
    expect(reg(execute(mainWith("  li $t0, 65536\n  li $t1, 65536\n  mul $t2, $t0, $t1")), T2)).toBe(0);
  });

  it("keeps $zero immutable", () => {
    const m = execute(mainWith("  li $zero, 5\n  addiu $t0, $zero, 1"));
    expect(reg(m, 0)).toBe(0);
    expect(reg(m, T0)).toBe(1);
  });

  it("expands pseudo-ops", () => {
    const m = execute(
      mainWith(`  li $t0, 5
  move $t1, $t0
  neg $t2, $t0
  not $t3, $zero
  li $t4, 9
  sub $t5, $t4, 4
  add $t6, $t4, 100000
  and $t7, $t4, 0xFF`),
    );
    expect([reg(m, T1), reg(m, T2), reg(m, 11), reg(m, 13), reg(m, 14), reg(m, 15)]).toEqual([5, -5, -1, 5, 100009, 9]);
  });
});

describe("memory semantics", () => {
  const DATA = "w: .word 0x80000081, 7\nb: .byte 0x81, 2";

  it("is little endian; lb sign extends, lbu zero extends", () => {
    const m = execute(
      mainWith(
        `  la $s0, w
  lb $t0, 0($s0)
  lbu $t1, 0($s0)
  lb $t2, 3($s0)
  lw $t3, 0($s0)
  la $s1, b
  lb $t4, 0($s1)`,
        DATA,
      ),
    );
    expect([reg(m, T0), reg(m, T1), reg(m, T2), reg(m, 11), reg(m, 12)]).toEqual([-127, 129, -128, -2147483519, -127]);
  });

  it("requires word alignment", () => {
    const m = execute(mainWith("  la $s0, w\n  lw $t0, 2($s0)", DATA));
    expect(m.fault?.kind).toBe("misaligned");
    const s = execute(mainWith("  la $s0, w\n  sw $t0, 1($s0)", DATA));
    expect(s.fault?.kind).toBe("misaligned");
  });

  it("stores bytes and words", () => {
    const m = execute(
      mainWith(
        `  la $s0, buf
  li $t0, 0x41424344
  sw $t0, 0($s0)
  li $t1, 0x5A
  sb $t1, 5($s0)
  lw $t2, 0($s0)
  lbu $t3, 5($s0)`,
        "buf: .space 8",
      ),
    );
    expect(reg(m, T2)).toBe(0x41424344);
    expect(reg(m, 11)).toBe(0x5a);
  });

  it("keeps stack frames working", () => {
    const m = execute(
      `.text
main:
  addiu $sp, $sp, -8
  li $t0, 42
  sw $t0, 4($sp)
  lw $t1, 4($sp)
  addiu $sp, $sp, 8
  li $v0, 10
  syscall`,
    );
    expect(reg(m, T1)).toBe(42);
  });

  it("faults on invalid, null, and text-segment pointers", () => {
    expect(execute(mainWith("  lw $t0, 0($zero)")).fault?.kind).toBe("invalid-access");
    expect(execute(mainWith("  li $t0, 0x00400000\n  lw $t1, 0($t0)")).fault?.kind).toBe("invalid-access");
    expect(execute(mainWith("  li $t0, 0x10010000\n  lw $t1, 0($t0)")).fault?.kind).toBe("invalid-access");
  });
});

describe("allocation provenance", () => {
  const DATA = "a: .space 4\nb: .space 4";

  it("rejects an access escaping its allocation even into a neighbour", () => {
    const m = execute(mainWith("  la $t0, a\n  addiu $t0, $t0, 4\n  sb $zero, 0($t0)", DATA));
    expect(m.fault?.kind).toBe("allocation-escape");
    expect(m.fault?.line).toBe(8);
  });

  it("allows in-bounds interior pointers and tracks move/addu", () => {
    const m = execute(
      mainWith("  la $t0, a\n  move $t1, $t0\n  li $t2, 3\n  addu $t1, $t1, $t2\n  sb $zero, 0($t1)", DATA),
    );
    expect(m.status).toBe("exited");
    const bad = execute(
      mainWith("  la $t0, a\n  move $t1, $t0\n  li $t2, 4\n  addu $t1, $t1, $t2\n  sb $zero, 0($t1)", DATA),
    );
    expect(bad.fault?.kind).toBe("allocation-escape");
  });

  it("preserves provenance through sw/lw and invalidates on partial overwrite", () => {
    const store = `  la $t0, a
  la $s0, b
  sw $t0, 0($s0)
  lw $t1, 0($s0)
  addiu $t1, $t1, 4
  sb $zero, 0($t1)`;
    expect(execute(mainWith(store, DATA)).fault?.kind).toBe("allocation-escape");
    const overwritten = `  la $t0, a
  la $s0, b
  sw $t0, 0($s0)
  sb $zero, 1($s0)
  lw $t1, 0($s0)
  addiu $t1, $t1, 4
  sb $zero, 0($t1)`;
    // provenance dropped, so the numeric address 'b' (after overwrite becomes unknown) is checked by location only
    const m = execute(mainWith(overwritten, DATA));
    expect(m.status === "exited" || m.fault?.kind === "invalid-access").toBe(true);
  });

  it("tracks .word label initializers", () => {
    const m = execute(
      mainWith(`  la $t0, ptr\n  lw $t1, 0($t0)\n  addiu $t1, $t1, 4\n  sb $zero, 0($t1)`, "ptr: .word a\na: .space 4\nb: .space 4"),
    );
    expect(m.fault?.kind).toBe("allocation-escape");
  });
});

describe("control flow and termination", () => {
  it("branches without delay slots", () => {
    const m = execute(
      mainWith(`  li $t0, 0
  li $t1, 5
loop:
  addiu $t0, $t0, 1
  blt $t0, $t1, loop
  li $t2, 1`),
    );
    expect(reg(m, T0)).toBe(5);
    expect(reg(m, T2)).toBe(1);
  });

  it("supports all comparison pseudo-branches", () => {
    const check = (branch: string, a: number, b: number) =>
      reg(execute(mainWith(`  li $t0, ${a}\n  li $t1, ${b}\n  li $t2, 0\n  ${branch} $t0, $t1, skip\n  li $t2, 1\nskip:`)), T2);
    expect(check("blt", 1, 2)).toBe(0);
    expect(check("blt", 2, 2)).toBe(1);
    expect(check("ble", 2, 2)).toBe(0);
    expect(check("ble", 3, 2)).toBe(1);
    expect(check("bgt", 3, 2)).toBe(0);
    expect(check("bgt", 2, 2)).toBe(1);
    expect(check("bge", 2, 2)).toBe(0);
    expect(check("bge", 1, 2)).toBe(1);
    expect(check("bltu", -1, 1)).toBe(1);
    expect(check("bgtu", -1, 1)).toBe(0);
    expect(check("bgeu", 1, 1)).toBe(0);
    expect(check("bleu", 2, 1)).toBe(1);
    const imm = (branch: string, a: number, c: number) =>
      reg(execute(mainWith(`  li $t0, ${a}\n  li $t2, 0\n  ${branch} $t0, ${c}, skip\n  li $t2, 1\nskip:`)), T2);
    expect(imm("blt", 4, 5)).toBe(0);
    expect(imm("ble", 5, 5)).toBe(0);
    expect(imm("bgt", 5, 5)).toBe(1);
    expect(imm("bgt", 6, 5)).toBe(0);
    expect(imm("bge", 5, 5)).toBe(0);
    expect(imm("beq", 7, 7)).toBe(0);
    expect(imm("bne", 7, 7)).toBe(1);
  });

  it("supports zero-comparison branches", () => {
    const t = (b: string, v: number) =>
      reg(execute(mainWith(`  li $t0, ${v}\n  li $t2, 0\n  ${b} $t0, skip\n  li $t2, 1\nskip:`)), T2);
    expect(t("bltz", -1)).toBe(0);
    expect(t("bgez", 0)).toBe(0);
    expect(t("blez", 1)).toBe(1);
    expect(t("bgtz", 1)).toBe(0);
    expect(t("beqz", 0)).toBe(0);
    expect(t("bnez", 0)).toBe(1);
  });

  it("calls and returns with jal/jr", () => {
    const m = execute(
      `.text
main:
  li $a0, 6
  jal double
  move $s0, $v0
  li $v0, 10
  syscall
double:
  sll $v0, $a0, 1
  jr $ra`,
    );
    expect(reg(m, 16)).toBe(12);
  });

  it("accepts the documented termination conventions", () => {
    expect(execute(".text\nmain:\n li $v0, 10\n syscall").exitCode).toBe(0);
    const exit17 = execute(".text\nmain:\n li $v0, 17\n li $a0, 3\n syscall");
    expect(exit17.status).toBe("exited");
    expect(exit17.exitCode).toBe(3);
    const ret = execute(".text\nmain:\n li $v0, 0\n jr $ra");
    expect(ret).toMatchObject({ status: "exited", exitCode: 0, termination: "return" });
    expect(ret.regs[31]! >>> 0).toBe(HOST_RETURN);
    expect(execute(".text\nmain:\n li $v0, 4\n jr $ra").exitCode).toBe(4);
  });

  it("faults when falling off the program or jumping to garbage", () => {
    expect(execute(".text\nmain:\n nop").fault?.kind).toBe("invalid-jump");
    expect(execute(".text\nmain:\n li $t0, 3\n jr $t0").fault?.kind).toBe("invalid-jump");
  });

  it("enforces the instruction limit deterministically", () => {
    const m = execute(".text\nmain:\nloop: b loop");
    expect(m.fault?.kind).toBe("instruction-limit");
    expect(m.instructionCount).toBe(100_000);
  });

});
