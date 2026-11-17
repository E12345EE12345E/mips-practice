import type { TestInput } from "../types";

/** Raw stdin text for a test input. */
export function inputToStdin(input: TestInput): string {
  switch (input.kind) {
    case "none":
      return "";
    case "integers":
      return `${input.values[0]} ${input.values[1]}\n`;
    case "string":
      return `${input.value}\n`;
  }
}

/**
 * Validate preview stdin that must be exactly one whitespace-delimited token
 * over an alphabet with a length range. Returns an error message or null.
 */
export function validateTokenInput(
  text: string,
  options: { alphabet: RegExp; alphabetLabel: string; minLength: number; maxLength: number },
): string | null {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length !== 1) return "Enter exactly one token (no spaces).";
  const token = tokens[0]!;
  if (!options.alphabet.test(token)) return `Use only ${options.alphabetLabel}.`;
  if (token.length < options.minLength || token.length > options.maxLength) {
    return `Length must be between ${options.minLength} and ${options.maxLength} characters.`;
  }
  return null;
}

/** Validate preview stdin that must be exactly two integers in a range. */
export function validateIntegerPair(text: string, min: number, max: number): string | null {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length !== 2) return "Enter exactly two integers separated by a space.";
  for (const token of tokens) {
    if (!/^[0-9]+$/.test(token)) return "Use only decimal digits.";
    const value = Number(token);
    if (value < min || value > max) return `Each integer must be between ${min} and ${max}.`;
  }
  return null;
}
