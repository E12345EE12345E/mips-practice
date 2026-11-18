# MIPS Practice

A static, browser-only practice site for translating small C programs into MIPS assembly.

- The left column shows a randomly parameterised **C prompt** (top) and a live **memory / register visualization** (bottom).
- The right side is a **Monaco assembly editor** with diagnostics, completions and hover help.
- As you type, a **live preview** assembles and runs your program (in a Web Worker) against a sample input you control, and draws registers, allocations and pointer arrows.
- **Check solution** runs your program against a hidden suite generated in a *separate* worker. You only ever see a bounded summary (cases passed and failure categories). Hidden inputs, expected outputs, seeds and traces never reach the UI or `localStorage`.

Everything runs client-side. There is no server, no accounts and no network access at runtime.

## Quick start

Requires Node 22 or newer (see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:5173
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm test` | Vitest: unit and conformance tests |
| `npm run test:e2e` | Playwright against a fresh build (`npx playwright install chromium` once) |
| `npm run validate` | Typecheck, lint, tests and build |

## Exercise families

| Family | Hidden cases |
| --- | --- |
| Literal arithmetic (`constant-arithmetic`) | 1 |
| Bounded string echo (`string-echo`) | 3 |
| Arithmetic on two input integers (`input-arithmetic`) | 3 |
| Two indexed characters (`character-pair`) | 5 |
| Toggle the case of one character (`toggle-case`) | 4 |

Every prompt includes the sentence *"No error checking is needed outside the stated specifications."* Inputs are always valid with respect to the stated specification.

## How it works

```
src/
  mips/         assembler + interpreter (pure TypeScript, also runs in Node)
  problems/     exercise families, generators, independent oracles
  grading/      hidden suite construction and byte-exact comparison
  workers/      typed worker protocol, preview worker, grader worker, watchdog client
  editor/       Monaco setup and the MIPS language definition
  state/        session hook and versioned persistence
  visualization/ graph model (pure), React Flow components, table view
  app/          layout and panels
tests/
  unit/         assembler, machine, syscalls, graph model
  conformance/  generators, known-good and known-bad solutions, C-vs-oracle checks
  e2e/          Playwright
docs/
  dialect.md           the supported MIPS dialect
  problem-authoring.md how to add an exercise family
  deployment.md        GitHub Pages and a custom domain
```

Key design points:

- **Oracles never parse C.** Each family has an independent TypeScript oracle computing expected output from the generated parameters and the input. The C text shown to the learner is rendered from the same parameters. When a C compiler is available, `tests/conformance/cCompile.test.ts` compiles the rendered C and checks it against the oracle (set `REQUIRE_C_COMPILER=1` to make a missing compiler an error, as CI does).
- **Allocation-aware memory.** Each storage directive is one allocation. Pointer provenance is tracked, so writing past the end of a buffer is reported as an overflow even if the bytes happen to land in a neighbouring allocation.
- **Revision-aware preview.** Results carry the problem key, source revision and input revision; stale results are discarded, and after an invalid edit the last valid snapshot stays on screen, clearly labelled.
- **Bounded execution.** 100,000 instructions, 16 KiB of output, 64 KiB of source, and a wall-clock watchdog that terminates and replaces a stuck worker.

See [`docs/dialect.md`](docs/dialect.md) for the exact instruction set and syscall semantics (syscall 8 intentionally behaves like `scanf("%Ns")`, not MARS's `fgets`).

## Deployment

Pushes to `main` build and deploy to GitHub Pages. See [`docs/deployment.md`](docs/deployment.md) for the repository setup, base path, and custom domain (`public/CNAME.example`).

## License

MIT

## V2 challenge

Skipping reveals the reference code and result for two seconds before the next
problem appears. Press Escape during a run to return to the menu without saving
that run's score. Translation prompts include a fixed syscall reference table.

The default entry point is a 2-minute challenge alternating C fragment translation
and MIPS behavior tracing. Answers are checked as they change. Each correct answer
scores one point; skipping costs ten seconds. High scores are stored locally under
`mips-practice:v2:score:1`. The original practice environment and its saved drafts
remain at `/v1/` through a separate Vite HTML entry point.

`src/problems/easy/translation.ts` and `tracing.ts` define the individual easy
families and their independent numeric/byte oracles. Easy translation reference
solutions contain at most three nonblank lines, including labels, except
`set_two_ints_perform_op`, which is in the speedrun pool by design. Longer families
live in `src/problems/normal/translation.ts` under `c_snippet_to_mips_normal`:
`set_three_ints_perform_op`, `counted_sum_loop`, `read_two_ints`, and
`read_bounded_string`. These remain generatable and tested but
are excluded from speedruns and currently unused by either interface. The original
full-program generators belong to `c_snippet_to_mips_legacy` and serve `/v1/`.
Shared snippet contracts live in `src/problems/snippets.ts`.
`tests/unit/challenge.test.ts`
executes reference solutions and checks trace oracles against the interpreter.
Translation fragments must reach the supplied suffix; grading observes their
outgoing registers/memory as well as final stdout. Input-dependent families run
multiple cases. The grader worker bounds execution and coalesces pending edits.

The palette and game settings live in `src/challenge/palette.ts`. The interface
supports reduced motion, keyboard focus, scalar answers and byte cells with
`\0`, `\n`, `\r`, `\t` and `\\` escapes. Syscall 8 retains the lab's token-reading
semantics. Signed `div rs, rt` is now supported, with quotient in LO and remainder
in HI; zero divisors and signed overflow fault.
