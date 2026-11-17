import type { NumberFormat } from "../state/session";

export const hex32 = (value: number): string => `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
export const hex8 = (value: number): string => (value & 0xff).toString(16).padStart(2, "0");

/** Format a 32-bit register or word value in the selected base. */
export function formatWord(value: number, format: NumberFormat): string {
  return format === "hex" ? hex32(value) : String(value | 0);
}

/** Format a byte: decimal (unsigned) or two hex digits. */
export function formatByte(value: number, format: NumberFormat): string {
  return format === "hex" ? hex8(value) : String(value & 0xff);
}

/**
 * ASCII view of one byte: zero terminators as `\0`, printable ASCII as itself,
 * everything else as hex.
 */
export function asciiCell(value: number): { text: string; kind: "zero" | "char" | "hex" } {
  const b = value & 0xff;
  if (b === 0) return { text: "\\0", kind: "zero" };
  if (b >= 32 && b <= 126) return { text: String.fromCharCode(b), kind: "char" };
  return { text: hex8(b), kind: "hex" };
}

/** Compact textual ASCII rendering of a byte run (used by the accessible table). */
export function asciiString(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    const cell = asciiCell(b);
    out += cell.kind === "char" ? cell.text : cell.kind === "zero" ? "\\0" : `\\x${cell.text}`;
  }
  return out;
}
