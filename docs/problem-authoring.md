# Authoring a new exercise family

An exercise family is one `ProblemType<P>` (`src/problems/types.ts`) plus test fixtures. Parameters `P` are small, serializable, and fully determine the C text and the hidden suite shape.

## Ground rules

1. **The oracle is independent code.** `expectedStdout(params, input)` must compute the answer in TypeScript from the parameters and the structured input. **Never parse the rendered C** to get answers.
2. **Inputs are always valid.** Generate only inputs that satisfy the stated constraints, and state those constraints in `describe()`. The prompt mechanism appends the mandatory sentence *"No error checking is needed outside the stated specifications."* automatically; do not remove it.
3. **Exact test counts.** `testCount` is the exact number of hidden cases `makeTests` returns. `buildSuite` throws if they differ.
4. **Public and hidden randomness are separate.** `generateParams` and `makePreview` receive streams derived from a discarded seed. `makeTests` receives a stream derived from a seed that exists only inside the grader worker. Do not draw hidden values from the public stream and do not log or persist them.
5. **Use the shared RNG.** Only `src/problems/random.ts` (versioned xoshiro128\*\*, `deriveStream`, unbiased `int`). Never `Math.random()`. Changing generation for an existing family means bumping its `version`, because restored drafts are keyed by it.

## Steps

1. Create `src/problems/families/<name>.ts` exporting a `ProblemType<YourParams>`:

   | Member | Responsibility |
   | --- | --- |
   | `id`, `version`, `title`, `testCount` | identity and the exact hidden case count |
   | `generateParams(rng)` | pick parameters (buffer sizes, indices, constants) |
   | `validateParams(p)` | throw if params are out of range; also used when restoring a saved draft |
   | `renderBody(p)` | the C statements shown to the learner; use `shared/c.ts` helpers |
   | `describe(p)` | prompt text: instructions, input constraints, output description, notes |
   | `starterAssembly(p)` | starter code, usually via `shared/starter.ts` |
   | `makePreview(p, rng)` | the learner-visible sample input |
   | `makeTests(p, rng)` | the hidden inputs (cover boundaries deliberately, then shuffle) |
   | `expectedStdout(p, input)` | the independent oracle, returning exact bytes |
   | `validatePreviewInput(p, text)` | return an error message, or `null`, for learner-typed sample input |

2. Register it in `src/problems/registry.ts` by appending `eraseProblem(yourFamily)` to `PROBLEM_TYPES`.

3. Add fixtures in `tests/fixtures/solutions/<name>.ts` (several genuinely different **correct** MIPS programs, including ones that use `jr $ra`, extra buffer space, and loops) and `tests/fixtures/incorrect/<name>.ts` (off-by-one, wrong case, missing newline handling, overflowing the buffer, ...). Register both in `tests/conformance/solutions.test.ts`. The suite runs every correct fixture for 40 seeds and requires every incorrect one to fail.

4. Update `tests/conformance/generators.test.ts` (including its committed snapshot when you intentionally change generation) and, if the C is compilable, `tests/conformance/cCompile.test.ts`.

5. Add the family to the README table, and an e2e smoke assertion if it has unusual UI needs.

## C text

`renderBody` is the body of `main`. `shared/c.ts` supplies the headers and the `int main(void) { ... }` wrapper and appends `return 0;`. Write bodies that compile as C99 with only the declared headers, and that produce output byte-for-byte identical to the oracle for every valid input; `cCompile.test.ts` checks this when a C compiler is present (`REQUIRE_C_COMPILER=1` makes absence an error, as in CI).

## Input kinds

`TestInput` is structured: `{ kind: "none" }`, `{ kind: "integers", values: [a, b] }` or `{ kind: "string", value }`. `shared/input.ts` turns it into the exact stdin text and validates learner-typed sample input. When you need a new kind, add it to `src/problems/types.ts` and `shared/input.ts`. Only public parameters and the learner's own sample input are ever persisted.

## Checklist

- [ ] oracle independent of the C text
- [ ] `testCount` exact; boundaries covered
- [ ] valid inputs only; constraints stated
- [ ] RNG usage via `random.ts`; hidden stream not leaked
- [ ] ≥ 2 correct fixtures with different structure; ≥ 3 incorrect fixtures
- [ ] `npm run validate` passes
