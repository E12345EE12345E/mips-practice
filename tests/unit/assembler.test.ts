import { describe, expect, it } from "vitest";
import { assemble } from "../../src/mips/assembler";
import { DATA_BASE, TEXT_BASE } from "../../src/mips/limits";
import { lexLine } from "../../src/mips/lexer";
import { build, errorsOf, execute, mainWith } from "./helpers";

describe("lexer", () => {
  it("distinguishes comments from # inside strings and chars", () => {
    const tokens = lexLine('s: .asciiz "a#b" # comment', 1);
    expect(tokens.map((t) => t.kind)).toEqual(["ident", "colon", "directive", "string"]);
    expect(tokens[3]!.bytes).toEqual([97, 35, 98]);
    const chars = lexLine("li $t0, '#'", 1);
    expect(chars[3]!.value).toBe(35);
  });

  it("handles escapes", () => {
    const [tok] = lexLine('"a\\n\\t\\"\\\\\\0"', 1);
    expect(tok!.bytes).toEqual([97, 10, 9, 34, 92, 0]);
    expect(lexLine("'\\n'", 1)[0]!.value).toBe(10);
    expect(() => lexLine('"bad\\q"', 1)).toThrow(/escape/);
    expect(() => lexLine('"open', 1)).toThrow(/Unterminated/);
  });

  it("rejects malformed literals", () => {
    expect(() => lexLine("li $t0, 0x", 1)).toThrow(/hexadecimal/);
    expect(() => lexLine("li $t0, 12ab", 1)).toThrow(/Malformed/);
    expect(() => lexLine("li $t0, 99999999999", 1)).toThrow(/too large/);
    expect(() => lexLine("li $t0, @", 1)).toThrow(/Unexpected/);
  });

  it("keeps source spans", () => {
    const tokens = lexLine("  add $t0, $t1, $t2", 7);
    expect(tokens[0]).toMatchObject({ line: 7, col: 3, endCol: 6 });
  });
});

describe("assembler", () => {
  it("resolves forward labels and data addresses", () => {
    const program = build(`
.data
a: .word 1, 2
b: .space 5
c: .asciiz "hi"
.text
main:
  j end
  nop
end:
  li $v0, 10
  syscall
`);
    const sym = (n: string) => program.symbols.find((s) => s.name === n)!;
    expect(sym("a").address).toBe(DATA_BASE);
    expect(sym("b").address).toBe(DATA_BASE + 8);
    expect(sym("c").address).toBe(DATA_BASE + 13);
    expect(sym("end").address).toBe(TEXT_BASE + 8);
    expect(program.instructions[0]!.target).toBe(2);
    expect(program.allocations.map((a) => [a.length, a.directive])).toEqual([
      [8, ".word"],
      [5, ".space"],
      [3, ".asciiz"],
    ]);
  });

  it("treats adjacent labels as aliases of one allocation", () => {
    const program = build(`.data
x:
y: .space 4
.text
main: li $v0, 10
syscall`);
    expect(program.allocations).toHaveLength(1);
    const syms = program.symbols.filter((s) => s.segment === "data");
    expect(syms.map((s) => s.alloc)).toEqual([1, 1]);
  });

  it("does not extend allocations over alignment padding", () => {
    const program = build(`.data
a: .byte 1
.align 2
b: .word 7
.text
main: li $v0, 10
syscall`);
    expect(program.allocations[0]).toMatchObject({ start: DATA_BASE, length: 1 });
    expect(program.allocations[1]).toMatchObject({ start: DATA_BASE + 4, length: 4 });
  });

  it("emits fixed two-instruction la and documented li expansion", () => {
    const program = build(`.data
v: .word 0
.text
main:
  la $t0, v
  li $t1, 5
  li $t2, 40000
  li $t3, -40000
  li $t4, 0x12340000
  li $t5, 0x12345678
`);
    const ops = program.instructions.map((i) => i.op);
    expect(ops).toEqual(["lui", "ori", "addiu", "ori", "lui", "ori", "lui", "lui", "ori"]);
    // every expansion keeps the original source line
    expect(program.instructions[0]!.span.line).toBe(program.instructions[1]!.span.line);
  });

  it("reports duplicate and unresolved labels", () => {
    expect(errorsOf(".text\nmain:\nmain:\n j nowhere")).toEqual(
      expect.arrayContaining([expect.stringMatching(/Duplicate label 'main'/), expect.stringMatching(/Undefined label 'nowhere'/)]),
    );
  });

  it("reports malformed operands and out-of-range immediates", () => {
    expect(errorsOf(".text\nmain: add $t0, $t1")[0]).toMatch(/Invalid operands for 'add'/);
    expect(errorsOf(".text\nmain: addi $t0, $t1, 40000")[0]).toMatch(/out of range/);
    expect(errorsOf(".text\nmain: sll $t0, $t1, 32")[0]).toMatch(/out of range/);
    expect(errorsOf(".text\nmain: ori $t0, $t1, -1")[0]).toMatch(/out of range/);
    expect(errorsOf(".text\nmain: add $t0, $t1, $zz")[0]).toMatch(/Unknown register/);
    expect(errorsOf(".text\nmain: lw $t0, 4($t1")[0]).toMatch(/\)/);
  });

  it("reports unsupported and unknown instructions clearly", () => {
    expect(errorsOf(".text\nmain: divu $t0, $t1")[0]).toMatch(/not supported/);
    expect(errorsOf(".text\nmain: mtlo $t0")[0]).toMatch(/not supported/);
    expect(errorsOf(".text\nmain: frobnicate $t0")[0]).toMatch(/Unknown instruction/);
    expect(errorsOf(".text\nmain: nop\n.macro foo")[0]).toMatch(/not supported/);
  });

  it("rejects bad directives, alignment, and oversized allocations", () => {
    expect(errorsOf(".data\n.align 99\n.text\nmain: nop")[0]).toMatch(/Impossible alignment/);
    expect(errorsOf(".data\nbig: .space 99999999\n.text\nmain: nop")[0]).toMatch(/exceeds the data limit/);
    expect(errorsOf(".data\na: .space 600000\nb: .space 600000\n.text\nmain: nop")[0]).toMatch(/too large/);
    expect(errorsOf(".data\n.byte 300\n.text\nmain: nop")[0]).toMatch(/out of range/);
    expect(errorsOf(".text\n.word 4\nmain: nop")[0]).toMatch(/only allowed in the .data/);
    expect(errorsOf(".data\nadd $t0,$t0,$t0\n.text\nmain: nop")[0]).toMatch(/only allowed in the .text/);
  });

  it("requires main", () => {
    expect(errorsOf(".text\nstart: nop")[0]).toMatch(/no 'main'/);
  });

  it("collects several diagnostics with spans", () => {
    const result = assemble(".text\nmain:\n  foo $t0\n  bar $t1\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.line)).toEqual([3, 4]);
    }
  });

  it("maps pseudo-op expansions back to the source line", () => {
    const program = build(".text\nmain:\n  blt $t0, $t1, main\n  li $v0, 10\n  syscall");
    expect(program.instructions.slice(0, 2).map((i) => i.span.line)).toEqual([3, 3]);
    expect(program.instructions[0]!.groupLength).toBe(2);
    expect(program.groupCount).toBe(3);
  });

  it("supports label-plus-constant and memory pseudo-forms", () => {
    const m = execute(
      mainWith(
        `  lw $t0, arr+4
  lw $t1, arr
  la $t2, arr
  li $t3, 8
  lw $t4, arr($t3)
  lb $t5, 4($t2)`,
        "arr: .word 10, 20, 30",
      ),
    );
    expect([m.regs[8], m.regs[9], m.regs[12], m.regs[13]]).toEqual([20, 10, 30, 20]);
  });

  it("rejects source above the size limit", () => {
    expect(errorsOf("# " + "x".repeat(70_000))[0]).toMatch(/too large/);
  });
});
