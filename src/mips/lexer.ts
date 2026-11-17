import { AsmError, type Span } from "./types";

export type TokenKind =
  | "ident"
  | "directive"
  | "register"
  | "int"
  | "string"
  | "comma"
  | "lparen"
  | "rparen"
  | "colon"
  | "plus"
  | "minus";

export interface Token extends Span {
  kind: TokenKind;
  text: string;
  /** Numeric value for `int` tokens (decimal, hex, or character literals). */
  value?: number;
  /** Decoded bytes for `string` tokens. */
  bytes?: number[];
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_.$]/;
const DIGIT = /[0-9]/;
const HEX_DIGIT = /[0-9A-Fa-f]/;

const ESCAPES: Record<string, number> = {
  n: 10,
  t: 9,
  r: 13,
  "0": 0,
  "\\": 92,
  '"': 34,
  "'": 39,
  a: 7,
  b: 8,
  f: 12,
  v: 11,
};

/** Maximum literal magnitude accepted anywhere: unsigned 32-bit. */
const MAX_LITERAL = 0xffffffff;

function readEscape(line: string, i: number, lineNo: number, startCol: number): { value: number; next: number } {
  // line[i] is the character after the backslash.
  const ch = line[i];
  if (ch === undefined) {
    throw new AsmError("Unterminated escape sequence", { line: lineNo, col: startCol, endCol: i + 1 });
  }
  if (ch === "x") {
    let j = i + 1;
    let digits = "";
    while (j < line.length && digits.length < 2 && HEX_DIGIT.test(line[j]!)) {
      digits += line[j];
      j++;
    }
    if (digits === "") {
      throw new AsmError("Malformed \\x escape", { line: lineNo, col: startCol, endCol: j + 1 });
    }
    return { value: parseInt(digits, 16), next: j };
  }
  const value = ESCAPES[ch];
  if (value === undefined) {
    throw new AsmError(`Unknown escape sequence \\${ch}`, { line: lineNo, col: startCol, endCol: i + 2 });
  }
  return { value, next: i + 1 };
}

/**
 * Tokenize one source line. `#` starts a comment only outside string and
 * character literals. Throws AsmError for malformed lexemes.
 */
export function lexLine(line: string, lineNo: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;
  const mk = (kind: TokenKind, start: number, end: number, extra?: Partial<Token>): Token => ({
    kind,
    text: line.slice(start, end),
    line: lineNo,
    col: start + 1,
    endCol: end + 1,
    ...extra,
  });

  while (i < n) {
    const ch = line[i]!;
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "#") break;
    const start = i;

    if (ch === ",") {
      tokens.push(mk("comma", i, i + 1));
      i++;
    } else if (ch === "(") {
      tokens.push(mk("lparen", i, i + 1));
      i++;
    } else if (ch === ")") {
      tokens.push(mk("rparen", i, i + 1));
      i++;
    } else if (ch === ":") {
      tokens.push(mk("colon", i, i + 1));
      i++;
    } else if (ch === "+") {
      tokens.push(mk("plus", i, i + 1));
      i++;
    } else if (ch === "-") {
      tokens.push(mk("minus", i, i + 1));
      i++;
    } else if (ch === '"') {
      i++;
      const bytes: number[] = [];
      let closed = false;
      while (i < n) {
        const c = line[i]!;
        if (c === '"') {
          closed = true;
          i++;
          break;
        }
        if (c === "\\") {
          const esc = readEscape(line, i + 1, lineNo, start + 1);
          bytes.push(esc.value);
          i = esc.next;
          continue;
        }
        const code = c.charCodeAt(0);
        if (code > 127) {
          throw new AsmError("Only ASCII characters are allowed in string literals", {
            line: lineNo,
            col: i + 1,
            endCol: i + 2,
          });
        }
        bytes.push(code);
        i++;
      }
      if (!closed) {
        throw new AsmError("Unterminated string literal", { line: lineNo, col: start + 1, endCol: n + 1 });
      }
      tokens.push(mk("string", start, i, { bytes }));
    } else if (ch === "'") {
      i++;
      let value: number;
      if (line[i] === "\\") {
        const esc = readEscape(line, i + 1, lineNo, start + 1);
        value = esc.value;
        i = esc.next;
      } else if (i < n && line[i] !== "'") {
        value = line.charCodeAt(i);
        if (value > 127) {
          throw new AsmError("Only ASCII characters are allowed in character literals", {
            line: lineNo,
            col: i + 1,
            endCol: i + 2,
          });
        }
        i++;
      } else {
        throw new AsmError("Empty character literal", { line: lineNo, col: start + 1, endCol: i + 2 });
      }
      if (line[i] !== "'") {
        throw new AsmError("Unterminated character literal", { line: lineNo, col: start + 1, endCol: i + 1 });
      }
      i++;
      tokens.push(mk("int", start, i, { value }));
    } else if (ch === "$") {
      i++;
      while (i < n && /[A-Za-z0-9]/.test(line[i]!)) i++;
      if (i === start + 1) {
        throw new AsmError("Expected a register name after '$'", { line: lineNo, col: start + 1, endCol: start + 2 });
      }
      tokens.push(mk("register", start, i));
    } else if (DIGIT.test(ch)) {
      let value: number;
      if (ch === "0" && (line[i + 1] === "x" || line[i + 1] === "X")) {
        i += 2;
        const digitsStart = i;
        while (i < n && HEX_DIGIT.test(line[i]!)) i++;
        if (i === digitsStart) {
          throw new AsmError("Malformed hexadecimal literal", { line: lineNo, col: start + 1, endCol: i + 1 });
        }
        value = parseInt(line.slice(digitsStart, i), 16);
      } else {
        while (i < n && DIGIT.test(line[i]!)) i++;
        value = parseInt(line.slice(start, i), 10);
      }
      if (i < n && IDENT_PART.test(line[i]!)) {
        throw new AsmError(`Malformed numeric literal '${line.slice(start, i + 1)}…'`, {
          line: lineNo,
          col: start + 1,
          endCol: i + 2,
        });
      }
      if (value > MAX_LITERAL) {
        throw new AsmError("Numeric literal is too large for 32 bits", { line: lineNo, col: start + 1, endCol: i + 1 });
      }
      tokens.push(mk("int", start, i, { value }));
    } else if (ch === ".") {
      i++;
      while (i < n && IDENT_PART.test(line[i]!)) i++;
      if (i === start + 1) {
        throw new AsmError("Expected a directive name after '.'", { line: lineNo, col: start + 1, endCol: start + 2 });
      }
      tokens.push(mk("directive", start, i));
    } else if (IDENT_START.test(ch)) {
      i++;
      while (i < n && IDENT_PART.test(line[i]!)) i++;
      tokens.push(mk("ident", start, i));
    } else {
      throw new AsmError(`Unexpected character '${ch}'`, { line: lineNo, col: start + 1, endCol: start + 2 });
    }
  }
  return tokens;
}
