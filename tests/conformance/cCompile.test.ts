import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSuite } from "../../src/grading/suite";
import { viewProblem } from "../../src/problems/instance";
import { deriveStream, type Seed } from "../../src/problems/random";
import { PROBLEM_TYPES } from "../../src/problems/registry";

/**
 * Compiles generated C programs with a normal C compiler and compares their
 * stdout with the TypeScript oracle. Skipped when no compiler is installed
 * unless REQUIRE_C_COMPILER=1 (set in CI).
 */
function findCompiler(): string | null {
  for (const cc of [process.env.CC, "gcc", "cc", "clang"]) {
    if (!cc) continue;
    const probe = spawnSync(cc, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return cc;
  }
  return null;
}

const compiler = findCompiler();

describe("generated C agrees with the oracle", () => {
  if (!compiler) {
    it.skipIf(process.env.REQUIRE_C_COMPILER !== "1")("a C compiler is available", () => {
      throw new Error("REQUIRE_C_COMPILER=1 but no C compiler was found");
    });
    it.skip("compiles and runs generated programs (no C compiler installed)", () => {});
    return;
  }

  it("matches stdout byte for byte for representative inputs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mips-practice-c-"));
    try {
      for (const entry of PROBLEM_TYPES) {
        for (let s = 0; s < 6; s++) {
          const seed: Seed = [s + 1, s * 17 + 3, s * 101, entry.id.length];
          const params = entry.generateParams(deriveStream(seed, "params"));
          const view = viewProblem({ key: "k", typeId: entry.id, typeVersion: entry.version, params, previewStdin: "" });
          const src = path.join(dir, `${entry.id}-${s}.c`);
          const exe = path.join(dir, `${entry.id}-${s}${process.platform === "win32" ? ".exe" : ""}`);
          writeFileSync(src, view.program.full);
          const build = spawnSync(compiler, ["-std=c11", "-Wall", "-o", exe, src], { encoding: "utf8" });
          expect(build.status, `${entry.id}: ${build.stderr}`).toBe(0);

          const suite = buildSuite(entry, params, seed);
          for (const testCase of suite.cases) {
            const run = spawnSync(exe, [], { input: testCase.stdin, encoding: "latin1" });
            expect(run.status).toBe(0);
            expect(Buffer.from(run.stdout, "latin1").equals(Buffer.from(testCase.expected))).toBe(true);
          }
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
