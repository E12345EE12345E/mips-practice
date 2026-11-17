/** Starter assembly shared by every family; `data` lines go in `.data`. */
export function starterProgram(options: { intro: string[]; data: string[] }): string {
  const lines = [
    "# Translate the C program into MIPS assembly.",
    ...options.intro.map((l) => `# ${l}`),
    "",
    "        .data",
    ...(options.data.length > 0 ? options.data : ["        # declare static storage here, if you need any"]),
    "",
    "        .text",
    "        .globl main",
    "main:",
    "        # TODO: translate the C code here",
    "",
    "        li   $v0, 10          # exit",
    "        syscall",
    "",
  ];
  return lines.join("\n");
}

export const STRING_SYSCALL_HINT =
  "Read a string with syscall 8: $v0 = 8, $a0 = buffer address, $a1 = capacity (including the zero byte).";
