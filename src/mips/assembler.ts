import { expandInstruction, type Proto } from "./instructions";
import { DATA_BASE, LIMITS, MAX_DATA_BYTES, TEXT_BASE } from "./limits";
import { parseLine, type Operand, type ParsedLine } from "./parser";
import {
  AsmError,
  type AssembleResult,
  type Allocation,
  type Diagnostic,
  type Expr,
  type Instr,
  type Span,
  type SymbolInfo,
} from "./types";

type DataItem =
  | { kind: "bytes"; offset: number; bytes: number[] }
  | { kind: "words"; offset: number; exprs: Expr[]; allocId: number };

interface TextEntry {
  proto: Proto;
  span: Span;
  group: number;
  groupStart: number;
  groupLength: number;
}

const UNSUPPORTED_DIRECTIVES = new Set([".half", ".float", ".double", ".eqv", ".macro", ".include", ".set", ".kdata", ".ktext", ".extern"]);

function toDiagnostic(e: AsmError): Diagnostic {
  return { severity: "error", message: e.message, line: e.span.line, col: e.span.col, endCol: e.span.endCol };
}

function lineSpan(line: number, text: string): Span {
  return { line, col: 1, endCol: Math.max(2, text.length + 1) };
}

function constantOperand(op: Operand | undefined, what: string, span: Span): number {
  if (!op) throw new AsmError(`${what} requires a value`, span);
  if (op.kind !== "expr" || op.expr.symbol !== undefined) {
    throw new AsmError(`${what} requires a constant number`, op.span);
  }
  return op.expr.offset;
}

/**
 * Two-pass assembler. Pass one computes expansion sizes, segment offsets,
 * symbols, and allocation extents; pass two resolves references and emits
 * normalized instructions plus initial data.
 */
export function assemble(source: string): AssembleResult {
  const diagnostics: Diagnostic[] = [];
  const fail = (e: AsmError) => {
    if (diagnostics.length < LIMITS.maxDiagnostics) diagnostics.push(toDiagnostic(e));
  };

  if (source.length > LIMITS.maxSourceBytes) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          message: `Source is too large (${source.length} bytes; limit ${LIMITS.maxSourceBytes})`,
          line: 1,
          col: 1,
          endCol: 2,
        },
      ],
    };
  }

  const lines = source.split(/\r\n|\n|\r/);
  const symbols = new Map<string, SymbolInfo>();
  const allocations: Allocation[] = [];
  const dataItems: DataItem[] = [];
  const text: TextEntry[] = [];
  const globals: Array<{ name: string; span: Span }> = [];

  let segment: "text" | "data" = "text";
  let dataOffset = 0;
  let groupCount = 0;
  let pendingLabels: Array<{ name: string; line: number }> = [];

  const defineSymbol = (info: SymbolInfo, span: Span) => {
    const existing = symbols.get(info.name);
    if (existing) {
      fail(new AsmError(`Duplicate label '${info.name}' (first defined on line ${existing.line})`, span));
      return;
    }
    symbols.set(info.name, info);
  };

  const flushPendingLabels = (alloc: number) => {
    for (const label of pendingLabels) {
      defineSymbol(
        { name: label.name, segment: "data", address: DATA_BASE + dataOffset, alloc, line: label.line },
        { line: label.line, col: 1, endCol: 2 },
      );
    }
    pendingLabels = [];
  };

  const alignData = (exponent: number) => {
    const unit = 2 ** exponent;
    dataOffset = Math.ceil(dataOffset / unit) * unit;
  };

  const emitStorage = (
    directive: string,
    size: number,
    lineNo: number,
    span: Span,
    wordAligned: boolean,
  ): number | null => {
    if (size === 0) return null;
    if (wordAligned) alignData(2);
    if (dataOffset + size > MAX_DATA_BYTES) {
      throw new AsmError(`Data segment is too large (limit ${MAX_DATA_BYTES} bytes)`, span);
    }
    const id = allocations.length + 1;
    allocations.push({
      id,
      kind: "data",
      start: DATA_BASE + dataOffset,
      length: size,
      line: lineNo,
      directive,
    });
    flushPendingLabels(id);
    const offset = dataOffset;
    dataOffset += size;
    return offset;
  };

  // ---- Pass one ----
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    let parsed: ParsedLine;
    try {
      parsed = parseLine(rawLine, lineNo);
    } catch (e) {
      if (e instanceof AsmError) {
        fail(e);
        return;
      }
      throw e;
    }

    try {
      for (const label of parsed.labels) {
        if (segment === "text") {
          defineSymbol(
            {
              name: label.name,
              segment: "text",
              address: TEXT_BASE + text.length * 4,
              alloc: -1,
              line: lineNo,
            },
            label.span,
          );
        } else {
          pendingLabels.push({ name: label.name, line: lineNo });
        }
      }

      const stmt = parsed.statement;
      if (!stmt) return;

      if (stmt.kind === "instr") {
        if (segment !== "text") {
          throw new AsmError("Instructions are only allowed in the .text segment", stmt.span);
        }
        const protos = expandInstruction(stmt.mnemonic, stmt.operands, stmt.span);
        if (text.length + protos.length > LIMITS.maxTextInstructions) {
          throw new AsmError(`Program is too large (limit ${LIMITS.maxTextInstructions} instructions)`, stmt.span);
        }
        const groupStart = text.length;
        const group = groupCount++;
        for (const proto of protos) {
          text.push({ proto, span: stmt.span, group, groupStart, groupLength: protos.length });
        }
        return;
      }

      const { name, operands } = stmt;
      switch (name) {
        case ".text":
        case ".data": {
          if (operands.length > 0) throw new AsmError(`${name} does not take operands in this lab`, stmt.span);
          if (segment === "data" && name === ".text") flushPendingLabels(-1);
          segment = name === ".text" ? "text" : "data";
          return;
        }
        case ".globl":
        case ".global": {
          if (operands.length === 0) throw new AsmError(`${name} requires a label`, stmt.span);
          for (const op of operands) {
            if (op.kind !== "expr" || op.expr.symbol === undefined || op.expr.offset !== 0) {
              throw new AsmError(`${name} expects label names`, op.span);
            }
            globals.push({ name: op.expr.symbol, span: op.span });
          }
          return;
        }
        case ".align": {
          const k = constantOperand(operands[0], ".align", stmt.span);
          if (operands.length !== 1) throw new AsmError(".align takes exactly one operand", stmt.span);
          if (!Number.isInteger(k) || k < 0 || k > LIMITS.maxAlignExponent) {
            throw new AsmError(
              `Impossible alignment .align ${k} (allowed range is 0..${LIMITS.maxAlignExponent})`,
              operands[0]!.span,
            );
          }
          if (segment === "text") {
            if (k > 2) throw new AsmError("Instructions are always word aligned; .align above 2 is not supported in .text", stmt.span);
            return;
          }
          alignData(k);
          if (dataOffset > MAX_DATA_BYTES) throw new AsmError("Data segment is too large", stmt.span);
          return;
        }
        case ".space": {
          if (segment !== "data") throw new AsmError(".space is only allowed in the .data segment", stmt.span);
          if (operands.length !== 1) throw new AsmError(".space takes exactly one operand", stmt.span);
          const n = constantOperand(operands[0], ".space", stmt.span);
          if (!Number.isInteger(n) || n < 0) throw new AsmError(".space size must be a non-negative integer", operands[0]!.span);
          if (n > MAX_DATA_BYTES) {
            throw new AsmError(`.space ${n} exceeds the data limit (${MAX_DATA_BYTES} bytes)`, operands[0]!.span);
          }
          emitStorage(".space", n, lineNo, stmt.span, false);
          return;
        }
        case ".byte": {
          if (segment !== "data") throw new AsmError(".byte is only allowed in the .data segment", stmt.span);
          if (operands.length === 0) throw new AsmError(".byte requires at least one value", stmt.span);
          const bytes = operands.map((op) => {
            const v = constantOperand(op, ".byte", stmt.span);
            if (v < -128 || v > 255) throw new AsmError(`.byte value ${v} is out of range (-128..255)`, op.span);
            return v & 0xff;
          });
          const offset = emitStorage(".byte", bytes.length, lineNo, stmt.span, false);
          if (offset !== null) dataItems.push({ kind: "bytes", offset, bytes });
          return;
        }
        case ".word": {
          if (segment !== "data") throw new AsmError(".word is only allowed in the .data segment", stmt.span);
          if (operands.length === 0) throw new AsmError(".word requires at least one value", stmt.span);
          const exprs = operands.map((op) => {
            if (op.kind !== "expr") throw new AsmError(".word values must be numbers or label expressions", op.span);
            if (op.expr.symbol === undefined && (op.expr.offset < -0x80000000 || op.expr.offset > 0xffffffff)) {
              throw new AsmError(`.word value ${op.expr.offset} does not fit in 32 bits`, op.span);
            }
            return op.expr;
          });
          const offset = emitStorage(".word", exprs.length * 4, lineNo, stmt.span, true);
          if (offset !== null) dataItems.push({ kind: "words", offset, exprs, allocId: allocations.length });
          return;
        }
        case ".ascii":
        case ".asciiz": {
          if (segment !== "data") throw new AsmError(`${name} is only allowed in the .data segment`, stmt.span);
          if (operands.length === 0) throw new AsmError(`${name} requires a string`, stmt.span);
          const bytes: number[] = [];
          for (const op of operands) {
            if (op.kind !== "string") throw new AsmError(`${name} expects string literals`, op.span);
            bytes.push(...op.bytes);
            if (name === ".asciiz") bytes.push(0);
          }
          const offset = emitStorage(name, bytes.length, lineNo, stmt.span, false);
          if (offset !== null) dataItems.push({ kind: "bytes", offset, bytes });
          return;
        }
        default: {
          if (UNSUPPORTED_DIRECTIVES.has(name)) {
            throw new AsmError(`Directive '${name}' is not supported by this lab`, stmt.span);
          }
          throw new AsmError(`Unknown directive '${name}'`, stmt.span);
        }
      }
    } catch (e) {
      if (e instanceof AsmError) {
        fail(e);
        return;
      }
      throw e;
    }
  });

  flushPendingLabels(-1);

  // ---- Pass two ----
  const data = new Uint8Array(dataOffset);
  const wordProvenance: Array<[number, number]> = [];

  const lookup = (expr: Expr): { symbol: SymbolInfo; address: number } => {
    const symbol = symbols.get(expr.symbol ?? "");
    if (!symbol) {
      throw new AsmError(`Undefined label '${expr.symbol}'`, expr.span);
    }
    return { symbol, address: (symbol.address + expr.offset) >>> 0 };
  };

  for (const item of dataItems) {
    try {
      if (item.kind === "bytes") {
        data.set(item.bytes, item.offset);
      } else {
        item.exprs.forEach((expr, i) => {
          let value: number;
          if (expr.symbol === undefined) {
            value = expr.offset >>> 0;
          } else {
            const { symbol, address } = lookup(expr);
            value = address;
            if (symbol.segment === "data" && symbol.alloc >= 0) {
              wordProvenance.push([DATA_BASE + item.offset + i * 4, symbol.alloc]);
            }
          }
          const at = item.offset + i * 4;
          data[at] = value & 0xff;
          data[at + 1] = (value >>> 8) & 0xff;
          data[at + 2] = (value >>> 16) & 0xff;
          data[at + 3] = (value >>> 24) & 0xff;
        });
      }
    } catch (e) {
      if (e instanceof AsmError) fail(e);
      else throw e;
    }
  }

  const instructions: Instr[] = [];
  for (const entry of text) {
    const { proto } = entry;
    const instr: Instr = {
      op: proto.op,
      rd: proto.rd,
      rs: proto.rs,
      rt: proto.rt,
      imm: proto.imm,
      target: -1,
      alloc: -1,
      span: entry.span,
      group: entry.group,
      groupStart: entry.groupStart,
      groupLength: entry.groupLength,
    };
    try {
      if (proto.sym && proto.symKind) {
        const { symbol, address } = lookup(proto.sym);
        if (proto.symKind === "hi") {
          instr.imm = address >>> 16;
          instr.alloc = symbol.segment === "data" ? symbol.alloc : -1;
        } else if (proto.symKind === "lo") {
          instr.imm = address & 0xffff;
        } else {
          if (symbol.segment !== "text") {
            throw new AsmError(`'${symbol.name}' is a data label, not a code label`, proto.sym.span);
          }
          instr.target = (symbol.address - TEXT_BASE) / 4;
        }
      }
    } catch (e) {
      if (e instanceof AsmError) {
        fail(e);
        continue;
      }
      throw e;
    }
    instructions.push(instr);
  }

  for (const g of globals) {
    if (!symbols.has(g.name)) fail(new AsmError(`Undefined label '${g.name}' in .globl`, g.span));
  }

  let entry = -1;
  const main = symbols.get("main");
  if (!main) {
    if (diagnostics.length === 0) {
      fail(new AsmError("Program has no 'main' label", lineSpan(1, lines[0] ?? "")));
    }
  } else if (main.segment !== "text") {
    fail(new AsmError("'main' must be a label in the .text segment", { line: main.line, col: 1, endCol: 2 }));
  } else {
    entry = (main.address - TEXT_BASE) / 4;
    if (entry >= instructions.length && diagnostics.length === 0) {
      fail(new AsmError("'main' has no instructions after it", { line: main.line, col: 1, endCol: 2 }));
    }
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    diagnostics,
    program: {
      instructions,
      data,
      allocations,
      symbols: [...symbols.values()].sort((a, b) => a.address - b.address),
      wordProvenance,
      entry,
      groupCount,
    },
  };
}
