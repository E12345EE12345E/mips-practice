import { lexLine, type Token } from "./lexer";
import { parseRegister } from "./registers";
import { AsmError, type Expr, type Span } from "./types";

export type Operand =
  | { kind: "reg"; reg: number; span: Span }
  | { kind: "expr"; expr: Expr; span: Span }
  | { kind: "mem"; offset: Expr; base: number | null; span: Span }
  | { kind: "string"; bytes: number[]; span: Span };

export interface LabelDef {
  name: string;
  span: Span;
}

export type Statement =
  | { kind: "directive"; name: string; operands: Operand[]; span: Span }
  | { kind: "instr"; mnemonic: string; operands: Operand[]; span: Span };

export interface ParsedLine {
  line: number;
  labels: LabelDef[];
  statement?: Statement;
}

function spanOf(first: Span, last: Span): Span {
  return { line: first.line, col: first.col, endCol: last.endCol };
}

class Cursor {
  private i = 0;
  constructor(
    readonly tokens: Token[],
    readonly lineNo: number,
    readonly lineLength: number,
  ) {}
  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset];
  }
  next(): Token | undefined {
    return this.tokens[this.i++];
  }
  get done(): boolean {
    return this.i >= this.tokens.length;
  }
  eof(): Span {
    const last = this.tokens[this.tokens.length - 1];
    return last
      ? { line: this.lineNo, col: last.endCol, endCol: last.endCol + 1 }
      : { line: this.lineNo, col: 1, endCol: 2 };
  }
}

function parseExpr(cur: Cursor): Expr {
  const first = cur.peek();
  if (!first) throw new AsmError("Expected an expression", cur.eof());
  let sign = 1;
  let symbol: string | undefined;
  let offset = 0;
  let last: Token = first;
  let expectTerm = true;
  let any = false;

  for (;;) {
    const tok = cur.peek();
    if (!tok) break;
    if (expectTerm) {
      if (tok.kind === "minus") {
        sign = -sign;
        cur.next();
        last = tok;
        continue;
      }
      if (tok.kind === "plus") {
        cur.next();
        last = tok;
        continue;
      }
      if (tok.kind === "int") {
        offset += sign * (tok.value ?? 0);
        cur.next();
        last = tok;
      } else if (tok.kind === "ident") {
        if (sign < 0) {
          throw new AsmError("A label cannot be negated in an address expression", tok);
        }
        if (symbol !== undefined) {
          throw new AsmError("Only one label is allowed in an address expression", tok);
        }
        symbol = tok.text;
        cur.next();
        last = tok;
      } else {
        throw new AsmError("Expected a number or label", tok);
      }
      sign = 1;
      expectTerm = false;
      any = true;
    } else {
      if (tok.kind === "plus") {
        sign = 1;
      } else if (tok.kind === "minus") {
        sign = -1;
      } else {
        break;
      }
      cur.next();
      last = tok;
      expectTerm = true;
    }
  }
  if (!any || expectTerm) {
    throw new AsmError("Incomplete expression", last);
  }
  return { symbol, offset, span: spanOf(first, last) };
}

function parseOperand(cur: Cursor): Operand {
  const tok = cur.peek();
  if (!tok) throw new AsmError("Expected an operand", cur.eof());

  if (tok.kind === "register") {
    const reg = parseRegister(tok.text);
    if (reg === null) throw new AsmError(`Unknown register '${tok.text}'`, tok);
    cur.next();
    return { kind: "reg", reg, span: tok };
  }
  if (tok.kind === "string") {
    cur.next();
    return { kind: "string", bytes: tok.bytes ?? [], span: tok };
  }
  if (tok.kind === "lparen") {
    // (base)
    cur.next();
    const baseTok = cur.next();
    const base = baseTok && baseTok.kind === "register" ? parseRegister(baseTok.text) : null;
    if (!baseTok || base === null) throw new AsmError("Expected a base register inside parentheses", baseTok ?? tok);
    const close = cur.next();
    if (!close || close.kind !== "rparen") throw new AsmError("Expected ')'", close ?? baseTok);
    const span = spanOf(tok, close);
    return { kind: "mem", offset: { offset: 0, span: tok }, base, span };
  }
  const expr = parseExpr(cur);
  if (cur.peek()?.kind === "lparen") {
    const open = cur.next()!;
    const baseTok = cur.next();
    const base = baseTok && baseTok.kind === "register" ? parseRegister(baseTok.text) : null;
    if (!baseTok || base === null) throw new AsmError("Expected a base register inside parentheses", baseTok ?? open);
    const close = cur.next();
    if (!close || close.kind !== "rparen") throw new AsmError("Expected ')'", close ?? baseTok);
    return { kind: "mem", offset: expr, base, span: spanOf(expr.span, close) };
  }
  return { kind: "expr", expr, span: expr.span };
}

function parseOperandList(cur: Cursor): Operand[] {
  const operands: Operand[] = [];
  if (cur.done) return operands;
  for (;;) {
    operands.push(parseOperand(cur));
    const sep = cur.peek();
    if (!sep) break;
    if (sep.kind !== "comma") {
      throw new AsmError(`Unexpected '${sep.text}' (operands must be separated by commas)`, sep);
    }
    cur.next();
    if (cur.done) throw new AsmError("Expected an operand after ','", sep);
  }
  return operands;
}

/** Parse a single source line. Throws AsmError on malformed syntax. */
export function parseLine(text: string, lineNo: number): ParsedLine {
  const tokens = lexLine(text, lineNo);
  const cur = new Cursor(tokens, lineNo, text.length);
  const labels: LabelDef[] = [];

  while (cur.peek()?.kind === "ident" && cur.peek(1)?.kind === "colon") {
    const id = cur.next()!;
    const colon = cur.next()!;
    labels.push({ name: id.text, span: spanOf(id, colon) });
  }
  if (cur.done) return { line: lineNo, labels };

  const head = cur.next()!;
  if (head.kind === "directive") {
    const operands = parseOperandList(cur);
    const lastSpan = operands.length > 0 ? operands[operands.length - 1]!.span : head;
    return {
      line: lineNo,
      labels,
      statement: { kind: "directive", name: head.text.toLowerCase(), operands, span: spanOf(head, lastSpan) },
    };
  }
  if (head.kind === "ident") {
    if (cur.peek()?.kind === "colon") {
      // handled above; unreachable but keeps the parser total
      throw new AsmError("Unexpected ':'", cur.peek()!);
    }
    const operands = parseOperandList(cur);
    const lastSpan = operands.length > 0 ? operands[operands.length - 1]!.span : head;
    return {
      line: lineNo,
      labels,
      statement: { kind: "instr", mnemonic: head.text.toLowerCase(), operands, span: spanOf(head, lastSpan) },
    };
  }
  throw new AsmError(`Expected an instruction, directive, or label but found '${head.text}'`, head);
}
