import { describe, expect, it } from "vitest";
import { runSuite } from "../../src/grading/runSuite";
import { buildSuite } from "../../src/grading/suite";
import { deriveStream, type Seed } from "../../src/problems/random";
import { getProblemType } from "../../src/problems/registry";
import type { Fixture } from "../fixtures/lib";
import { characterPairIncorrect } from "../fixtures/incorrect/characterPair";
import { constantArithmeticIncorrect } from "../fixtures/incorrect/constantArithmetic";
import { inputArithmeticIncorrect } from "../fixtures/incorrect/inputArithmetic";
import { stringEchoIncorrect } from "../fixtures/incorrect/stringEcho";
import { toggleCaseIncorrect } from "../fixtures/incorrect/toggleCase";
import { characterPairSolutions } from "../fixtures/solutions/characterPair";
import { constantArithmeticSolutions } from "../fixtures/solutions/constantArithmetic";
import { inputArithmeticSolutions } from "../fixtures/solutions/inputArithmetic";
import { stringEchoSolutions } from "../fixtures/solutions/stringEcho";
import { toggleCaseSolutions } from "../fixtures/solutions/toggleCase";

interface Family {
  id: string;
  solutions: (p: never) => Fixture[];
  incorrect: (p: never) => Fixture[];
}

const FAMILIES: Family[] = [
  { id: "constant-arithmetic", solutions: constantArithmeticSolutions as never, incorrect: constantArithmeticIncorrect as never },
  { id: "string-echo", solutions: stringEchoSolutions as never, incorrect: stringEchoIncorrect as never },
  { id: "input-arithmetic", solutions: inputArithmeticSolutions as never, incorrect: inputArithmeticIncorrect as never },
  { id: "character-pair", solutions: characterPairSolutions as never, incorrect: characterPairIncorrect as never },
  { id: "toggle-case", solutions: toggleCaseSolutions as never, incorrect: toggleCaseIncorrect as never },
];

const SEEDS: Seed[] = Array.from({ length: 40 }, (_, i) => [i + 11, i * 77 + 5, i * 13, 99 - i] as Seed);

describe.each(FAMILIES.map((f) => [f.id, f] as const))("fixtures: %s", (_id, family) => {
  const entry = getProblemType(family.id)!;

  it("accepts every known-correct MIPS solution", () => {
    for (const seed of SEEDS) {
      const params = entry.generateParams(deriveStream(seed, "params"));
      const suite = buildSuite(entry, params, seed);
      for (const fixture of family.solutions(params as never)) {
        const result = runSuite(fixture.source, suite.cases);
        expect(result.messages, `${fixture.name} ${JSON.stringify(params)}`).toEqual([]);
        expect(result.passed, `${fixture.name} ${JSON.stringify(params)}`).toBe(suite.cases.length);
      }
    }
  });

  it("rejects every intentionally incorrect fixture", () => {
    for (const seed of SEEDS) {
      const params = entry.generateParams(deriveStream(seed, "params"));
      const suite = buildSuite(entry, params, seed);
      for (const fixture of family.incorrect(params as never)) {
        const result = runSuite(fixture.source, suite.cases);
        expect(result.passed, `${fixture.name} ${JSON.stringify(params)}`).toBeLessThan(suite.cases.length);
      }
    }
  });
});

describe("failure categories", () => {
  const entry = getProblemType("string-echo")!;
  const params = { n: 20 };
  const suite = buildSuite(entry, params, [1, 2, 3, 4]);

  const category = (fixtures: Fixture[], name: string) => {
    const f = fixtures.find((x) => x.name.startsWith(name))!;
    return runSuite(f.source, suite.cases).failureCategories.map((c) => c.category);
  };

  it("reports buffer overflow, output mismatch and execution limit distinctly", () => {
    const bad = stringEchoIncorrect(params);
    expect(category(bad, "wrong string capacity")).toEqual(["buffer overflow"]);
    expect(category(bad, "extra newline")).toEqual(["output mismatch"]);
    expect(category(bad, "infinite loop")).toEqual(["execution limit"]);
    expect(category(bad, "manual terminator")).toEqual(["buffer overflow"]);
  });

  it("reports assembly errors and invalid access", () => {
    const asm = runSuite(".text\nmain: bogus $t0", suite.cases);
    expect(asm.failureCategories).toEqual([{ category: "assembly error", count: 3 }]);
    expect(asm.assemblyDiagnostics[0]!.line).toBe(2);
    const bad = runSuite(".text\nmain:\n lw $t0, 0($zero)\n li $v0, 10\n syscall", suite.cases);
    expect(bad.failureCategories).toEqual([{ category: "invalid access", count: 3 }]);
    expect(bad.messages[0]).toMatch(/line 3/);
  });

  it("never leaks hidden inputs or expected output in messages", () => {
    const result = runSuite(stringEchoIncorrect(params)[3]!.source, suite.cases);
    const text = JSON.stringify(result);
    for (const input of suite.inputs) {
      if (input.kind === "string") expect(text).not.toContain(input.value);
    }
  });

  it("fails nonzero exit status", () => {
    const result = runSuite(".text\nmain:\n li $v0, 17\n li $a0, 2\n syscall", suite.cases);
    expect(result.passed).toBe(0);
    expect(result.failureCategories[0]!.category).toBe("runtime fault");
  });

  it("does not trim output when comparing", () => {
    const echoWithNewline = runSuite(stringEchoIncorrect(params)[3]!.source, suite.cases);
    expect(echoWithNewline.passed).toBe(0);
  });
});
