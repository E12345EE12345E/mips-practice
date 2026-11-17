import type { Machine } from "./machine";
import { MachineFault } from "./memory";
import { REG } from "./registers";

/** Documentation shared with the in-app syscall reference. */
export const SYSCALL_DOCS = [
  { code: 1, name: "Print integer", description: "Append the signed decimal value of $a0 to stdout." },
  {
    code: 4,
    name: "Print string",
    description: "Append bytes from $a0 up to (not including) the first zero byte. Faults if no zero byte exists in the allocation.",
  },
  { code: 5, name: "Read integer", description: "Read the next whitespace-delimited decimal token into $v0." },
  {
    code: 8,
    name: "Read string (lab semantics)",
    description:
      "Like width-limited scanf(\"%Ns\"): $a0 = buffer, $a1 = capacity including the zero byte. Skips leading whitespace, copies at most $a1-1 token characters, then writes a zero byte. No newline is stored. Excess token characters stay available to later reads. $a1 larger than the buffer's remaining extent is a buffer-capacity fault. This differs from MARS, where syscall 8 behaves like fgets.",
  },
  { code: 10, name: "Exit", description: "Terminate successfully." },
  { code: 11, name: "Print character", description: "Append the low byte of $a0 to stdout." },
  { code: 17, name: "Exit with status", description: "Terminate with status $a0. A nonzero status fails a graded case." },
] as const;

function isSpace(code: number): boolean {
  // ASCII whitespace: space, \t, \n, \v, \f, \r
  return code === 32 || (code >= 9 && code <= 13);
}

function skipWhitespace(m: Machine): void {
  while (m.inputCursor < m.input.length && isSpace(m.input.charCodeAt(m.inputCursor))) m.inputCursor++;
}

export function executeSyscall(m: Machine): void {
  const service = m.regs[REG.v0]!;
  const a0 = m.regs[REG.a0]!;

  switch (service) {
    case 1: {
      const text = String(a0);
      for (let i = 0; i < text.length; i++) m.writeStdout(text.charCodeAt(i));
      return;
    }
    case 4: {
      const start = a0 >>> 0;
      const prov = m.provenance[REG.a0]!;
      const alloc = m.mem.check(start, 1, prov);
      const end = alloc.start + alloc.length;
      for (let addr = start; ; addr++) {
        if (addr >= end) {
          throw new MachineFault(
            "unterminated-string",
            `String at 0x${start.toString(16)} is not zero-terminated within allocation '${m.mem.allocationName(alloc.id)}'`,
          );
        }
        const byte = m.mem.readByte(addr);
        if (byte === 0) return;
        m.writeStdout(byte);
      }
    }
    case 5: {
      skipWhitespace(m);
      if (m.inputCursor >= m.input.length) {
        throw new MachineFault("input-exhausted", "Read integer: no input remains");
      }
      const begin = m.inputCursor;
      while (m.inputCursor < m.input.length && !isSpace(m.input.charCodeAt(m.inputCursor))) m.inputCursor++;
      const token = m.input.slice(begin, m.inputCursor);
      if (!/^[+-]?[0-9]+$/.test(token)) {
        throw new MachineFault("bad-input", "Read integer: the next input token is not a decimal integer");
      }
      const value = Number(token);
      if (value < -2147483648 || value > 2147483647) {
        throw new MachineFault("bad-input", "Read integer: value does not fit in 32 bits");
      }
      m.regs[REG.v0] = value;
      m.provenance[REG.v0] = -1;
      return;
    }
    case 8: {
      const capacity = m.regs[REG.a1]!;
      if (capacity <= 0) return; // writes nothing, consumes nothing
      const dest = a0 >>> 0;
      const prov = m.provenance[REG.a0]!;
      if (prov < 0) {
        throw new MachineFault(
          "unowned-buffer",
          "Read string: cannot establish which allocation $a0 points into (load the buffer address with la)",
        );
      }
      // Validate the entire requested capacity, including the terminating zero,
      // before writing anything. Never clamp an invalid capacity.
      const alloc = m.mem.allocations[prov];
      if (!alloc) throw new MachineFault("unowned-buffer", "Read string: unknown buffer allocation");
      const end = alloc.start + alloc.length;
      if (dest < alloc.start || dest >= end) {
        throw new MachineFault(
          "allocation-escape",
          `Read string: $a0 is outside allocation '${m.mem.allocationName(alloc.id)}'`,
        );
      }
      if (dest + capacity > end) {
        throw new MachineFault(
          "buffer-capacity",
          `Buffer capacity ${capacity} exceeds the ${end - dest} bytes remaining in allocation '${m.mem.allocationName(alloc.id)}'`,
        );
      }
      let length = 0;
      if (capacity >= 2) {
        skipWhitespace(m);
        if (m.inputCursor >= m.input.length) {
          throw new MachineFault("input-exhausted", "Read string: no input remains");
        }
        while (
          length < capacity - 1 &&
          m.inputCursor < m.input.length &&
          !isSpace(m.input.charCodeAt(m.inputCursor))
        ) {
          m.mem.writeByte(dest + length, m.input.charCodeAt(m.inputCursor) & 0xff);
          m.inputCursor++;
          length++;
        }
      }
      m.mem.writeByte(dest + length, 0);
      return;
    }
    case 10:
      m.exit(0, "syscall-10");
      return;
    case 11:
      m.writeStdout(a0 & 0xff);
      return;
    case 17:
      m.exit(a0, "syscall-17");
      return;
    default:
      throw new MachineFault("unsupported-syscall", `Unsupported syscall service ${service}`);
  }
}
