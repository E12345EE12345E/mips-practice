import { describe, expect, it } from "vitest";
import { buildSuite } from "../../src/grading/suite";
import { viewProblem } from "../../src/problems/instance";
import { createRng, deriveStream, ALPHANUMERIC, LETTERS, type Seed } from "../../src/problems/random";
import { getProblemType, PROBLEM_TYPES } from "../../src/problems/registry";
import { countPrintf, NO_ERROR_CHECKING_SENTENCE } from "../../src/problems/shared/c";
import { CAPACITIES } from "../../src/problems/shared/oracle";
import { inputToStdin } from "../../src/problems/shared/input";
import type { CharacterPairParams } from "../../src/problems/families/characterPair";
import type { ToggleCaseParams } from "../../src/problems/families/toggleCase";

const SEEDS: Seed[] = Array.from({ length: 200 }, (_, i) => [i * 7919 + 1, i * 104729 + 3, i ^ 0xdeadbeef, i * 31] as Seed);
const EXPECTED_COUNTS: Record<string, number> = {
  "constant-arithmetic": 1,
  "string-echo": 3,
  "input-arithmetic": 3,
  "character-pair": 5,
  "toggle-case": 4,
};

describe("PRNG", () => {
  it("is deterministic and versioned", () => {
    const a = createRng([1, 2, 3, 4]);
    const b = createRng([1, 2, 3, 4]);
    expect(Array.from({ length: 5 }, () => a.nextU32())).toEqual(Array.from({ length: 5 }, () => b.nextU32()));
    // Golden values guard against accidental algorithm changes (bump PRNG_VERSION if intentional).
    const g = createRng([1, 2, 3, 4]);
    expect([g.nextU32(), g.nextU32(), g.nextU32()]).toMatchSnapshot();
  });

  it("derives independent streams", () => {
    const seed: Seed = [9, 8, 7, 6];
    const a = deriveStream(seed, "params").nextU32();
    const b = deriveStream(seed, "preview").nextU32();
    expect(a).not.toBe(b);
    expect(deriveStream(seed, "params").nextU32()).toBe(a);
  });

  it("selects unbiased integers within inclusive bounds", () => {
    const rng = createRng([5, 5, 5, 5]);
    const counts = new Array(7).fill(0);
    for (let i = 0; i < 70_000; i++) counts[rng.int(3, 9) - 3]++;
    for (const c of counts) expect(c).toBeGreaterThan(9_000);
    expect(rng.int(4, 4)).toBe(4);
    expect(() => rng.int(5, 4)).toThrow();
  });

  it("works with a degenerate zero seed", () => {
    const rng = createRng([0, 0, 0, 0]);
    expect(new Set(Array.from({ length: 20 }, () => rng.nextU32())).size).toBeGreaterThan(10);
  });
});

describe("registry", () => {
  it("registers the five families with the required test counts", () => {
    expect(PROBLEM_TYPES.map((p) => p.id)).toEqual(Object.keys(EXPECTED_COUNTS));
    for (const p of PROBLEM_TYPES) expect(p.testCount).toBe(EXPECTED_COUNTS[p.id]);
  });
});

describe.each(PROBLEM_TYPES.map((p) => [p.id] as const))("generator invariants: %s", (id) => {
  const entry = getProblemType(id)!;

  it("builds exactly the required suite for many seeds", () => {
    for (const seed of SEEDS) {
      const params = entry.generateParams(deriveStream(seed, "params"));
      entry.validateParams(params);
      const suite = buildSuite(entry, params, seed);
      expect(suite.cases).toHaveLength(entry.testCount);
      // outputs are exact byte strings, no trimming
      for (const c of suite.cases) expect(c.expected).toBeInstanceOf(Uint8Array);
    }
  });

  it("renders C with exactly one printf, ending with printf then return 0, plus the mandatory sentence", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const params = entry.generateParams(deriveStream(seed, "params"));
      const view = viewProblem({ key: "k", typeId: id, typeVersion: entry.version, params, previewStdin: "" });
      const printfs = countPrintf(view.program.full);
      const bodyLines = view.program.body.split("\n");
      if (id === "toggle-case") {
        expect(printfs).toBe(2);
        expect(bodyLines[bodyLines.length - 1]).toMatch(/^\s*\}/);
      } else {
        expect(printfs).toBe(1);
        expect(bodyLines[bodyLines.length - 1]).toMatch(/^\s*printf\(/);
      }
      expect(view.program.tail.split("\n")[0]).toBe("    return 0;");
      expect(view.program.full.trimEnd().endsWith("return 0;\n}")).toBe(true);
      expect(view.program.full).not.toContain(NO_ERROR_CHECKING_SENTENCE);
      expect(view.noErrorChecking).toBe("No error checking is needed outside the stated specifications.");
      expect(view.program.full).toContain("#include <stdio.h>");
      expect(view.program.full).toMatch(/int main\(void\) \{/);
    }
  });

  it("generates visible previews inside the input domain, separate from hidden tests", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const params = entry.generateParams(deriveStream(seed, "params"));
      const preview = entry.makePreview(params, deriveStream(seed, "preview"));
      expect(entry.validatePreviewInput(params, inputToStdin(preview))).toBeNull();
    }
  });

  it("is reproducible from the same seed", () => {
    const seed = SEEDS[3]!;
    const p1 = entry.generateParams(deriveStream(seed, "params"));
    const p2 = entry.generateParams(deriveStream(seed, "params"));
    expect(p1).toEqual(p2);
  });
});

describe("constant arithmetic", () => {
  it("covers operators and prefixes with the shown example", () => {
    const entry = getProblemType("constant-arithmetic")!;
    const params = { a: 37, b: 64, op: "*", withPrefix: true };
    entry.validateParams(params);
    expect(entry.renderBody(params)).toBe('    int a = 37, b = 64;\n    printf("Result: %d", a * b);');
    expect(new TextDecoder().decode(entry.expectedStdout(params, { kind: "none" }))).toBe("Result: 2368");
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const p = entry.generateParams(deriveStream(seed, "params")) as { a: number; b: number; op: string; withPrefix: boolean };
      expect(p.a).toBeGreaterThanOrEqual(10);
      expect(p.a).toBeLessThanOrEqual(99);
      expect(p.b).toBeGreaterThanOrEqual(10);
      expect(p.b).toBeLessThanOrEqual(99);
      seen.add(`${p.op}${p.withPrefix}`);
    }
    expect(seen.size).toBe(6);
  });

  it("keeps negative subtraction results exact", () => {
    const entry = getProblemType("constant-arithmetic")!;
    const out = entry.expectedStdout({ a: 10, b: 99, op: "-", withPrefix: false }, { kind: "none" });
    expect(new TextDecoder().decode(out)).toBe("-89");
  });
});

describe("string echo suite", () => {
  const entry = getProblemType("string-echo")!;
  it("has normal, maximum-fitting and oversized cases over alphanumerics", () => {
    for (const seed of SEEDS) {
      const params = entry.generateParams(deriveStream(seed, "params")) as { n: number };
      expect(CAPACITIES as readonly number[]).toContain(params.n);
      const suite = buildSuite(entry, params, seed);
      const lengths = suite.inputs.map((i) => (i.kind === "string" ? i.value.length : -1));
      expect(lengths[0]).toBeGreaterThanOrEqual(1);
      expect(lengths[0]).toBeLessThanOrEqual(params.n - 2);
      expect(lengths[1]).toBe(params.n - 1);
      expect(lengths[2]).toBeGreaterThanOrEqual(params.n);
      expect(lengths[2]).toBeLessThanOrEqual(3 * params.n);
      for (const i of suite.inputs) {
        if (i.kind === "string") expect(i.value).toMatch(/^[A-Za-z0-9]+$/);
      }
      // oracle truncates the oversized case
      expect(suite.cases[2]!.expected).toHaveLength(params.n - 1);
      expect(suite.cases[1]!.expected).toHaveLength(params.n - 1);
    }
  });

  it("renders the width literally in scanf", () => {
    expect(entry.renderBody({ n: 30 })).toContain('scanf("%29s", text);');
    expect(entry.renderBody({ n: 30 })).toContain("char text[30];");
  });
});

describe("input arithmetic suite", () => {
  const entry = getProblemType("input-arithmetic")!;
  it("has three distinct in-range pairs", () => {
    for (const seed of SEEDS) {
      const params = entry.generateParams(deriveStream(seed, "params"));
      const suite = buildSuite(entry, params, seed);
      const keys = new Set<string>();
      for (const i of suite.inputs) {
        if (i.kind !== "integers") throw new Error("kind");
        for (const v of i.values) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(99);
        }
        keys.add(i.values.join(","));
      }
      expect(keys.size).toBe(3);
    }
  });

  it("covers deterministic regression cases", () => {
    const check = (op: "+" | "-" | "*", a: number, b: number, prefix: boolean) =>
      new TextDecoder().decode(entry.expectedStdout({ op, withPrefix: prefix }, { kind: "integers", values: [a, b] }));
    expect(check("-", 0, 0, false)).toBe("0");
    expect(check("-", 42, 42, false)).toBe("0");
    expect(check("-", 3, 9, false)).toBe("-6");
    expect(check("-", 9, 3, false)).toBe("6");
    expect(check("*", 99, 99, true)).toBe("Result: 9801");
    expect(check("*", 0, 77, false)).toBe("0");
  });
});

describe("character pair suite", () => {
  const entry = getProblemType("character-pair")!;
  it("keeps indices distinct, ordered, and below N-1; categories have the right lengths", () => {
    for (const seed of SEEDS) {
      const params = entry.generateParams(deriveStream(seed, "params")) as CharacterPairParams;
      const { n, i, j } = params;
      const m = Math.max(i, j);
      expect(i).not.toBe(j);
      expect(m).toBeLessThanOrEqual(n - 2);
      expect(Math.min(i, j)).toBeGreaterThanOrEqual(0);
      const suite = buildSuite(entry, params, seed);
      const len = suite.inputs.map((x) => (x.kind === "string" ? x.value.length : -1));
      expect(len[0]).toBe(m + 1);
      expect(len[1]).toBeGreaterThanOrEqual(m + 1);
      expect(len[1]).toBeLessThanOrEqual(n - 1);
      expect(len[2]).toBe(n - 1);
      expect(len[3]).toBeGreaterThanOrEqual(1);
      expect(len[3]).toBeLessThanOrEqual(m);
      expect(len[4]).toBeGreaterThanOrEqual(n);
      expect(len[4]).toBeLessThanOrEqual(3 * n);
      const outputs = suite.cases.map((c) => new TextDecoder().decode(c.expected));
      expect(outputs[3]).toBe("");
      for (const k of [0, 1, 2, 4]) expect(outputs[k]).toHaveLength(3);
      for (const k of [0, 1, 2, 4]) expect(outputs[k]![1]).toBe(":");
      for (const x of suite.inputs) if (x.kind === "string") expect(x.value).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("preserves the chosen order of the indices", () => {
    const out = entry.expectedStdout({ n: 10, i: 5, j: 1 }, { kind: "string", value: "abcdefghi" });
    expect(new TextDecoder().decode(out)).toBe("f:b");
    const trunc = entry.expectedStdout({ n: 10, i: 1, j: 8 }, { kind: "string", value: "abcdefghijklmnop" });
    expect(new TextDecoder().decode(trunc)).toBe("b:i");
    const short = entry.expectedStdout({ n: 10, i: 1, j: 5 }, { kind: "string", value: "abcde" });
    expect(short).toHaveLength(0);
  });

  it("handles the m = N-2 corner where valid lengths coincide", () => {
    const params = { n: 10, i: 8, j: 0 };
    entry.validateParams(params);
    const suite = buildSuite(entry, params, [1, 2, 3, 4]);
    expect(suite.cases).toHaveLength(5);
  });

  it("rejects invalid parameters", () => {
    expect(() => entry.validateParams({ n: 10, i: 3, j: 3 })).toThrow();
    expect(() => entry.validateParams({ n: 10, i: 9, j: 1 })).toThrow();
    expect(() => entry.validateParams({ n: 11, i: 1, j: 2 })).toThrow();
  });
});

describe("toggle case suite", () => {
  const entry = getProblemType("toggle-case")!;
  it("has two lowercase and two uppercase targets with letter-only inputs that fit", () => {
    for (const seed of SEEDS) {
      const params = entry.generateParams(deriveStream(seed, "params")) as ToggleCaseParams;
      const suite = buildSuite(entry, params, seed);
      let lower = 0;
      for (const input of suite.inputs) {
        if (input.kind !== "string") throw new Error("kind");
        expect(input.value).toMatch(/^[A-Za-z]+$/);
        expect(input.value.length).toBeGreaterThanOrEqual(params.k + 1);
        expect(input.value.length).toBeLessThanOrEqual(params.n - 1);
        if (/[a-z]/.test(input.value[params.k]!)) lower++;
      }
      expect(lower).toBe(2);
    }
  });

  it("returns only the single toggled character", () => {
    const run = (value: string, k: number) =>
      new TextDecoder().decode(entry.expectedStdout({ n: 20, k }, { kind: "string", value }));
    expect(run("abc", 0)).toBe("A");
    expect(run("xyz", 2)).toBe("Z");
    expect(run("Abc", 0)).toBe("a");
    expect(run("abZ", 2)).toBe("z");
    expect(run("a".repeat(18) + "Q", 18)).toBe("q");
    expect(() => entry.validateParams({ n: 20, k: 19 })).toThrow();
    entry.validateParams({ n: 20, k: 18 });
  });

  it("only accepts letters in the preview domain", () => {
    expect(entry.validatePreviewInput({ n: 20, k: 2 }, "abc1")).toMatch(/letters/);
    expect(entry.validatePreviewInput({ n: 20, k: 2 }, "ab")).toMatch(/Length/);
    expect(entry.validatePreviewInput({ n: 20, k: 2 }, "abc")).toBeNull();
  });

  it("toggles with if/else rather than a ternary", () => {
    expect(entry.renderBody({ n: 20, k: 3 })).toBe(
      [
        "    char text[20];",
        '    scanf("%19s", text);',
        "    char c = text[3];",
        "    if (c >= 'a' && c <= 'z') {",
        '        printf("%c", c - \'a\' + \'A\');',
        "    } else {",
        '        printf("%c", c - \'A\' + \'a\');',
        "    }",
      ].join("\n"),
    );
  });
});

describe("alphabets", () => {
  it("are ASCII only", () => {
    expect(ALPHANUMERIC).toMatch(/^[A-Za-z0-9]+$/);
    expect(LETTERS).toMatch(/^[A-Za-z]+$/);
  });
});
