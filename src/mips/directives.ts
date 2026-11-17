/** Directives accepted by the assembler, with editor-facing documentation. */
export const DIRECTIVES = [
  { name: ".data", syntax: ".data", summary: "Switch to the data segment (static storage)." },
  { name: ".text", syntax: ".text", summary: "Switch to the text segment (instructions)." },
  { name: ".globl", syntax: ".globl label", summary: "Declare a label as global (the entry point is always main)." },
  {
    name: ".word",
    syntax: ".word value[, value...]",
    summary: "Emit 4-byte words (auto-aligned). Values may be numbers or label+constant addresses. One list is one allocation.",
  },
  { name: ".byte", syntax: ".byte value[, value...]", summary: "Emit bytes (-128..255). One list is one allocation." },
  { name: ".space", syntax: ".space n", summary: "Reserve n zero bytes. One .space is one allocation (use it for string buffers)." },
  { name: ".ascii", syntax: '.ascii "text"', summary: "Emit string bytes without a terminator." },
  { name: ".asciiz", syntax: '.asciiz "text"', summary: "Emit string bytes followed by a zero byte." },
  { name: ".align", syntax: ".align k", summary: "Advance to the next 2^k byte boundary. Padding is not part of any allocation." },
] as const;

export const DIRECTIVE_NAMES: readonly string[] = DIRECTIVES.map((d) => d.name);
