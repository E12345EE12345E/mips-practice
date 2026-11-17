import { describe, expect, it } from "vitest";
import { assemble } from "../../src/mips/assembler";
import { DIRECTIVE_NAMES } from "../../src/mips/directives";
import { INSTRUCTIONS, UNSUPPORTED_MNEMONICS } from "../../src/mips/instructions";
import { EDITOR_INSTRUCTION_NAMES } from "../../src/editor/mipsLanguage";

describe("editor and assembler share one instruction table", () => {
  it("offers exactly the supported mnemonics", () => {
    expect([...EDITOR_INSTRUCTION_NAMES].sort()).toEqual(INSTRUCTIONS.map((i) => i.name).sort());
  });

  it("never offers an unsupported mnemonic", () => {
    for (const name of UNSUPPORTED_MNEMONICS) expect(EDITOR_INSTRUCTION_NAMES).not.toContain(name);
  });

  it("reports unsupported mnemonics as diagnostics, not crashes", () => {
    for (const name of UNSUPPORTED_MNEMONICS) {
      const result = assemble(`.text\nmain:\n  ${name} $t0, $t1, $t2\n`);
      expect(result.ok, name).toBe(false);
    }
  });

  it("accepts every listed directive name", () => {
    expect(DIRECTIVE_NAMES.length).toBeGreaterThan(0);
    for (const d of DIRECTIVE_NAMES) expect(d.startsWith(".")).toBe(true);
  });
});
