import { HOST_RETURN, TEXT_BASE } from "../mips/limits";
import type { AllocationView, Snapshot } from "../mips/snapshot";

/**
 * Presentation-neutral graph model derived from a snapshot. It contains no
 * layout information; positions are owned by the renderer so that dragging a
 * node never touches simulated state.
 */

export type ViewMode = "bytes" | "words" | "ascii";

export interface RegisterRow {
  index: number;
  name: string;
  value: number;
  changed: boolean;
  provenance: number;
  /** True for a zero value in a register that otherwise could hold a pointer. */
  isNull: boolean;
}

export interface CardModel {
  /** Stable identity: label name, or the declaring line when unlabeled. */
  nodeId: string;
  allocId: number;
  kind: "data" | "stack";
  labels: string[];
  directive: string;
  line: number;
  start: number;
  length: number;
  bytes: Uint8Array;
  changed: Uint8Array;
  truncated: boolean;
  defaultMode: ViewMode;
}

export interface CodeTargetModel {
  nodeId: string;
  label: string;
  address: number;
  host: boolean;
}

export type EdgeTone = "tracked" | "untracked" | "danger";

export interface EdgeEndpoint {
  nodeId: string;
  /** React Flow handle id on that node. */
  handle: string;
  /** Byte offset within a region, or -1 when attached to the node itself. */
  offset: number;
}

export interface EdgeModel {
  id: string;
  source: EdgeEndpoint;
  target: EdgeEndpoint;
  label: string;
  tone: EdgeTone;
  /** "inside", "end" (one past the end; not dereferenceable) or "out-of-bounds". */
  position: "inside" | "end" | "out-of-bounds";
  fromRegister: boolean;
}

export interface GraphModel {
  registers: RegisterRow[];
  special: { pc: number; hi: number; lo: number; hiChanged: boolean; loChanged: boolean };
  cards: CardModel[];
  codeTargets: CodeTargetModel[];
  edges: EdgeModel[];
  omittedCards: number;
}

export const MAX_CARDS = 40;
export const MAX_EDGES = 200;
export const REGISTERS_NODE_ID = "registers";

export function cardNodeId(a: Pick<AllocationView, "labels" | "line" | "kind">): string {
  if (a.kind === "stack") return "stack";
  return a.labels.length > 0 ? `alloc:${a.labels[0]}` : `alloc:line${a.line}`;
}

function defaultModeFor(a: AllocationView): ViewMode {
  if (a.kind === "stack") return "words";
  if (a.directive === ".word") return "words";
  if (a.directive === ".byte") return "bytes";
  return "ascii";
}

export function readWordUnsigned(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

interface Resolved {
  nodeId: string;
  handle: string;
  offset: number;
  position: "inside" | "end" | "out-of-bounds";
  label: string;
  code: boolean;
}

function describeOffset(name: string, offset: number): string {
  return offset === 0 ? name : `${name} + ${offset}`;
}

export function buildGraphModel(snapshot: Snapshot): GraphModel {
  const sorted = snapshot.allocations.slice();
  const shown = sorted.slice(0, MAX_CARDS);
  const stack = sorted.find((a) => a.kind === "stack");
  if (stack && !shown.includes(stack)) shown.push(stack);
  const omittedCards = sorted.length - shown.length;

  const cards: CardModel[] = shown.map((a) => ({
    nodeId: cardNodeId(a),
    allocId: a.id,
    kind: a.kind,
    labels: a.labels,
    directive: a.directive,
    line: a.line,
    start: a.start,
    length: a.length,
    bytes: a.bytes,
    changed: a.changed,
    truncated: a.truncated,
    defaultMode: defaultModeFor(a),
  }));
  const byAllocId = new Map<number, CardModel>(cards.map((c) => [c.allocId, c]));

  const textEnd = TEXT_BASE + snapshot.textLength * 4;
  const codeTargets = new Map<string, CodeTargetModel>();

  const nearestCodeLabel = (address: number) => {
    let best: { name: string; address: number } | null = null;
    for (const label of snapshot.codeLabels) {
      if (label.address <= address && (!best || label.address > best.address)) best = label;
    }
    return best;
  };

  const resolve = (value: number, provenance: number): Resolved | null => {
    const addr = value >>> 0;
    if (addr === 0) return null;

    if (addr === HOST_RETURN) {
      codeTargets.set("code:host-return", {
        nodeId: "code:host-return",
        label: "host return",
        address: HOST_RETURN,
        host: true,
      });
      return { nodeId: "code:host-return", handle: "dst:code", offset: -1, position: "inside", label: "host return", code: true };
    }

    // Tracked provenance: describe relative to its originating allocation.
    if (provenance >= 0) {
      const card = byAllocId.get(provenance);
      if (card) {
        const offset = addr - card.start;
        const name = card.labels[0] ?? (card.kind === "stack" ? "stack" : `line ${card.line}`);
        if (offset >= 0 && offset < card.length) {
          return { nodeId: card.nodeId, handle: `dst:${offset}`, offset, position: "inside", label: describeOffset(name, offset), code: false };
        }
        if (offset === card.length) {
          return {
            nodeId: card.nodeId,
            handle: "dst:end",
            offset,
            position: "end",
            label: `${describeOffset(name, offset)} (one past end)`,
            code: false,
          };
        }
        return {
          nodeId: card.nodeId,
          handle: "dst:card",
          offset,
          position: "out-of-bounds",
          label: `${name}${offset < 0 ? " - " + -offset : " + " + offset} (out of bounds)`,
          code: false,
        };
      }
    }

    for (const card of cards) {
      const offset = addr - card.start;
      if (offset >= 0 && offset < card.length) {
        const name = card.labels[0] ?? (card.kind === "stack" ? "stack" : `line ${card.line}`);
        return { nodeId: card.nodeId, handle: `dst:${offset}`, offset, position: "inside", label: describeOffset(name, offset), code: false };
      }
    }

    if (addr >= TEXT_BASE && addr < textEnd && addr % 4 === 0) {
      const label = nearestCodeLabel(addr);
      if (label) {
        const nodeId = `code:${label.name}`;
        if (!codeTargets.has(nodeId)) {
          codeTargets.set(nodeId, { nodeId, label: label.name, address: label.address, host: false });
        }
        const delta = addr - label.address;
        return { nodeId, handle: "dst:code", offset: -1, position: "inside", label: describeOffset(label.name, delta), code: true };
      }
    }
    return null;
  };

  const edges: EdgeModel[] = [];
  const addEdge = (
    source: EdgeEndpoint,
    resolved: Resolved,
    provenance: number,
    fromRegister: boolean,
  ) => {
    if (edges.length >= MAX_EDGES) return;
    const tone: EdgeTone = resolved.position === "out-of-bounds" ? "danger" : provenance >= 0 || resolved.code ? "tracked" : "untracked";
    const id = `${source.nodeId}:${source.handle}->${resolved.nodeId}:${resolved.handle}`;
    edges.push({
      id,
      source,
      target: { nodeId: resolved.nodeId, handle: resolved.handle, offset: resolved.offset },
      label: resolved.label,
      tone,
      position: resolved.position,
      fromRegister,
    });
  };

  const registers: RegisterRow[] = snapshot.registers.map((r) => ({
    index: r.index,
    name: r.name,
    value: r.value,
    changed: r.changed,
    provenance: r.provenance,
    isNull: r.value === 0 && r.index !== 0 && r.provenance < 0,
  }));

  for (const r of snapshot.registers) {
    if (r.index === 0) continue;
    const target = resolve(r.value, r.provenance);
    if (target) {
      addEdge({ nodeId: REGISTERS_NODE_ID, handle: `reg:${r.index}`, offset: -1 }, target, r.provenance, true);
    }
  }

  // Aligned words stored in memory that may hold addresses (including aliases and cycles).
  for (const view of snapshot.allocations) {
    const card = byAllocId.get(view.id);
    if (!card) continue;
    const tracked = new Map(view.wordProvenance);
    for (let offset = 0; offset + 4 <= view.bytes.length; offset += 4) {
      if ((view.start + offset) % 4 !== 0) continue;
      const word = readWordUnsigned(view.bytes, offset);
      if (word === 0) continue;
      const prov = tracked.get(offset) ?? -1;
      const target = resolve(word, prov);
      if (target) {
        addEdge({ nodeId: card.nodeId, handle: `src:${offset}`, offset }, target, prov, false);
      }
    }
  }

  return {
    registers,
    special: {
      pc: snapshot.pc,
      hi: snapshot.hi,
      lo: snapshot.lo,
      hiChanged: snapshot.hiChanged,
      loChanged: snapshot.loChanged,
    },
    cards,
    codeTargets: [...codeTargets.values()],
    edges,
    omittedCards,
  };
}
