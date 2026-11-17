/** Exact ASCII bytes of a string (all generated text is ASCII). */
export function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 127) throw new Error("Oracle produced a non-ASCII character");
    out[i] = code;
  }
  return out;
}

export type ArithmeticOp = "+" | "-" | "*";

export function applyOp(op: ArithmeticOp, a: number, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
  }
}

/** Format a result as the C program would: `%d` or `Result: %d`. */
export function formatResult(withPrefix: boolean, value: number): string {
  return `${withPrefix ? "Result: " : ""}${value}`;
}

export function printfFormat(withPrefix: boolean): string {
  return withPrefix ? "Result: %d" : "%d";
}

export const CAPACITIES = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;
