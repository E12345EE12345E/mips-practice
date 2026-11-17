# Supported MIPS dialect

This is a bounded, educational MIPS32 subset. It is not MARS or SPIM, and where it differs the differences are deliberate. Everything below is generated from, or checked against, `src/mips/instructions.ts`, `directives.ts` and `syscalls.ts`; the editor's completions and hovers use the same tables.

## Syntax

- Labels: `name:` (may share a line with an instruction or directive).
- Comments start with `#`.
- Registers by number (`$0`..`$31`) or name (`$zero`, `$at`, `$v0-$v1`, `$a0-$a3`, `$t0-$t9`, `$s0-$s7`, `$k0-$k1`, `$gp`, `$sp`, `$fp`/`$s8`, `$ra`).
- Immediates: decimal, `0x` hex, character literals such as `'a'`, and `label`/`label+offset` expressions where an address is expected.
- Memory operands: `offset($reg)`, `($reg)`, or `label`/`label+offset` (expanded using `$at`).
- There are **no branch delay slots** and no load delay slots. Branch targets are labels.
- The entry point is always `main`.

## Instructions

Real instructions and the common pseudo-instructions:

```
lui li la move nop neg negu not
add addu sub subu addi addiu
mul mult multu mflo mfhi
and or xor nor andi ori xori
sll srl sra
slt sltu slti sltiu
lb lbu lw sb sw
beq bne beqz bnez bltz bgez blez bgtz
blt ble bgt bge bltu bleu bgtu bgeu
b j jal jr
syscall
```

Notes:

- `add`, `sub` and `addi` trap on signed overflow; the `u` forms wrap.
- `la` always expands to `lui` + `ori` (a fixed two instructions), so instruction counts are predictable.
- `li` expands to the shortest of `addiu`, `ori` or `lui`+`ori`.
- Pseudo-instructions that need a scratch register use `$at`. Do not rely on `$at` across them.
- `mult`/`multu` write `hi`/`lo`; read them with `mfhi`/`mflo`. `mul` writes only the low word to a register.
- Instruction counts reported by the UI and used for the 100,000-instruction limit count *expanded* (normalized) instructions.

Recognised but **not supported** (assembling them reports a clear diagnostic): `div divu rem remu mtlo mthi lh lhu sh sllv srlv srav jalr break eret mfc0 mtc0 lwc1 swc1 add.s sub.s mul.s div.s abs ulw usw seq sne sgt sge sle`.

Loads and stores must be naturally aligned (`lw`/`sw` to a multiple of 4).

## Directives

| Directive | Meaning |
| --- | --- |
| `.data`, `.text` | Select the segment |
| `.globl label` | Accepted; the entry is always `main` |
| `.word v[, v...]` | 32-bit words (values or label expressions); one allocation |
| `.byte v[, v...]` | Bytes (-128..255); one allocation |
| `.space n` | `n` zero bytes; one allocation |
| `.ascii "s"`, `.asciiz "s"` | String bytes without / with a terminator |
| `.align k` | Align to `2^k`; the padding is not part of any allocation |

## Memory model

| Region | Address |
| --- | --- |
| Text | `0x00400000` |
| Data | `0x10010000` |
| Stack | top at `0x7ffff000`, 64 KiB; `$sp` starts at `0x7fffeffc` |
| Host return sentinel | `0x0fff0000` (initial `$ra`) |

Storage in `.data` is split into **allocations**. Every storage directive (`.word`, `.byte`, `.space`, `.ascii`, `.asciiz`) is one allocation; several labels on the same directive are aliases of one allocation. The stack is allocation 0.

### Pointer provenance

Registers and aligned words in memory remember which allocation (if any) they were derived from.

- `la`, and arithmetic that adds or subtracts a plain integer to or from a pointer (`addiu`, `addu`, `move`, `add`, `sub`, ...), keeps the provenance.
- `lw`/`sw` carry provenance through memory.
- A byte store or partial overwrite invalidates provenance of the word it touches.
- An access **with** provenance must stay inside that allocation, otherwise it faults as `allocation-escape`. One past the end is a valid *pointer* to hold, but not a valid address to read or write.
- An access **without** provenance must still land inside some allocation (`invalid-access`).

This is what makes "wrote past the end of the buffer" a diagnosable error even when the bytes happen to fall inside the next buffer.

## Syscalls

| `$v0` | Name | Behaviour |
| --- | --- | --- |
| 1 | Print integer | Signed decimal of `$a0` |
| 4 | Print string | Bytes from `$a0` to the first zero byte; faults if the allocation has no terminator |
| 5 | Read integer | Next whitespace-delimited decimal token into `$v0` |
| 8 | Read string | **`scanf("%Ns")` semantics**, see below |
| 10 | Exit | Success |
| 11 | Print character | Low byte of `$a0` |
| 17 | Exit with status | Status `$a0`; a nonzero status fails a graded case |

Returning from `main` with `jr $ra` also ends the program, with status `$v0`.

### Syscall 8 (differs from MARS)

`$a0` is the buffer, `$a1` is the capacity **including** the zero byte. The call skips leading whitespace, copies at most `$a1 - 1` characters of the next whitespace-delimited token, then writes a zero byte. No newline is ever stored. Characters of the token that did not fit stay available to later reads. This matches `scanf("%{N}s")` with `N = $a1 - 1`, not MARS (where syscall 8 behaves like `fgets`).

- `$a0` must carry pointer provenance (`unowned-buffer` otherwise).
- The *whole* capacity `$a1` must fit between `$a0` and the end of its allocation (`buffer-capacity` otherwise). The runtime never silently clamps.
- `$a1 <= 0` does nothing; `$a1 == 1` writes only the zero byte.

## Limits

| Limit | Value |
| --- | --- |
| Source size | 64 KiB |
| Data + stack | 1 MiB |
| Executed instructions | 100,000 |
| Stdout | 16 KiB |
| Diagnostics shown | 50 |

Exceeding a limit is reported as a runtime fault, not a crash.
