/** Resource limits for the educational MIPS engine (plan section 5.4). */
export const LIMITS = {
  /** Maximum source size in bytes (UTF-16 code units of the string). */
  maxSourceBytes: 64 * 1024,
  /** Maximum combined simulated data + stack storage. */
  maxTotalMemoryBytes: 1024 * 1024,
  /** Fixed-size stack segment. */
  stackBytes: 64 * 1024,
  /** Maximum normalized instructions executed in one run. */
  maxInstructions: 100_000,
  /** Maximum stdout bytes. */
  maxStdoutBytes: 16 * 1024,
  /** Instructions per cooperative chunk (workers yield between chunks). */
  chunkSize: 1024,
  /** Maximum normalized instructions in the text segment. */
  maxTextInstructions: 16_384,
  /** Maximum number of assembly diagnostics reported. */
  maxDiagnostics: 50,
  /** Maximum alignment exponent accepted by `.align`. */
  maxAlignExponent: 12,
  /** Executed-line trace entries kept for the UI. */
  maxTraceEntries: 64,
  /** Wall-clock watchdog for a single worker request, in milliseconds. */
  workerWatchdogMs: 4000,
} as const;

/** Maximum bytes available for the data segment. */
export const MAX_DATA_BYTES = LIMITS.maxTotalMemoryBytes - LIMITS.stackBytes;

export const TEXT_BASE = 0x00400000;
export const DATA_BASE = 0x10010000;
export const STACK_TOP = 0x7ffff000; // exclusive end of the stack segment
export const STACK_BASE = STACK_TOP - LIMITS.stackBytes;
export const INITIAL_SP = STACK_TOP - 4;
/** Distinguished value of `$ra` at entry; `jr $ra` to it ends the program. */
export const HOST_RETURN = 0x0fff0000;
