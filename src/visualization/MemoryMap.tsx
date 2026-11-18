import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
  type OnNodesChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../mips/snapshot";
import type { NumberFormat } from "../state/session";
import {
  REGISTERS_NODE_ID,
  buildGraphModel,
  readWordUnsigned,
  type CardModel,
  type CodeTargetModel,
  type GraphModel,
  type RegisterRow,
  type ViewMode,
} from "./buildGraph";
import { asciiCell, formatByte, formatWord, hex32 } from "./format";
import PointerEdge, { TONE_COLORS, type PointerEdgeType } from "./PointerEdge";

// ---- Layout constants (fixed so handle positions can be computed) ----
const CARD_W = 384;
const CARD_HEADER_H = 58;
const CARD_BAR_H = 38;
const CARD_MORE_H = 36;
const REG_W = 300;
const REG_HEADER_H = 43;
const REG_ROW_H = 29;
const GAP = 34;

const GEOMETRY: Record<ViewMode, { cols: number; cellW: number; rowH: number; collapsedBytes: number; pageBytes: number; unit: number }> = {
  bytes: { cols: 8, cellW: 43, rowH: 53, collapsedBytes: 32, pageBytes: 64, unit: 1 },
  ascii: { cols: 12, cellW: 29, rowH: 41, collapsedBytes: 48, pageBytes: 96, unit: 1 },
  words: { cols: 1, cellW: 346, rowH: 34, collapsedBytes: 64, pageBytes: 128, unit: 4 },
};

interface CardUi {
  mode?: ViewMode;
  expanded?: boolean;
  page?: number;
}

interface Range {
  start: number;
  end: number;
}

function availableModes(card: CardModel): ViewMode[] {
  const wordsOk = card.length % 4 === 0 && card.start % 4 === 0;
  return wordsOk ? ["bytes", "words", "ascii"] : ["bytes", "ascii"];
}

function effectiveMode(card: CardModel, ui: CardUi | undefined): ViewMode {
  const wanted = ui?.mode ?? card.defaultMode;
  return availableModes(card).includes(wanted) ? wanted : "bytes";
}

function computeRange(card: CardModel, mode: ViewMode, ui: CardUi | undefined): Range {
  const g = GEOMETRY[mode];
  const total = card.bytes.length;
  if (!ui?.expanded) return { start: 0, end: Math.min(total, g.collapsedBytes) };
  const pages = Math.max(1, Math.ceil(total / g.pageBytes));
  const page = Math.min(Math.max(0, ui.page ?? 0), pages - 1);
  return { start: page * g.pageBytes, end: Math.min(total, (page + 1) * g.pageBytes) };
}

function rowCount(mode: ViewMode, range: Range): number {
  const g = GEOMETRY[mode];
  const cells = Math.ceil((range.end - range.start) / g.unit);
  return Math.max(1, Math.ceil(cells / g.cols));
}

function hasMoreRow(card: CardModel, range: Range): boolean {
  return range.start > 0 || range.end < card.length;
}

function cardHeight(card: CardModel, mode: ViewMode, range: Range): number {
  return CARD_HEADER_H + CARD_BAR_H + rowCount(mode, range) * GEOMETRY[mode].rowH + (hasMoreRow(card, range) ? CARD_MORE_H : 0) + 8;
}

/** Vertical handle position for a byte offset (cell row, or the "more" row when out of view). */
function handleY(card: CardModel, mode: ViewMode, range: Range, handle: string, offset: number): number {
  const g = GEOMETRY[mode];
  const bodyTop = CARD_HEADER_H + CARD_BAR_H;
  const rows = rowCount(mode, range);
  const moreY = bodyTop + rows * g.rowH + CARD_MORE_H / 2;
  if (handle === "dst:card") return CARD_HEADER_H / 2;
  if (handle === "dst:end") return hasMoreRow(card, range) ? moreY : bodyTop + rows * g.rowH - 4;
  if (offset < range.start || offset >= range.end) return moreY;
  const idx = Math.floor((offset - range.start) / g.unit);
  return bodyTop + Math.floor(idx / g.cols) * g.rowH + g.rowH / 2;
}

// ---- Node data ----
interface CardNodeData extends Record<string, unknown> {
  card: CardModel;
  mode: ViewMode;
  range: Range;
  expanded: boolean;
  page: number;
  numberFormat: NumberFormat;
  targets: Array<{ handle: string; offset: number }>;
  sources: number[];
  targetedOffsets: number[];
  emphasis: "normal" | "dim";
  onUi(nodeId: string, patch: CardUi): void;
}

interface RegistersNodeData extends Record<string, unknown> {
  rows: RegisterRow[];
  showAll: boolean;
  special: GraphModel["special"];
  numberFormat: NumberFormat;
  sources: number[];
  emphasis: "normal" | "dim";
  onToggleAll(): void;
}

interface CodeNodeData extends Record<string, unknown> {
  target: CodeTargetModel;
  emphasis: "normal" | "dim";
}

type CardNodeType = Node<CardNodeData, "card">;
type RegistersNodeType = Node<RegistersNodeData, "registers">;
type CodeNodeType = Node<CodeNodeData, "code">;
type MapNode = CardNodeType | RegistersNodeType | CodeNodeType;

// ---- Node renderers ----
const RegistersNode = memo(function RegistersNode({ data }: NodeProps<RegistersNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rowsKey = data.rows.map((r) => r.index).join(",") + "|" + data.sources.join(",");
  useEffect(() => {
    updateNodeInternals(REGISTERS_NODE_ID);
  }, [rowsKey, updateNodeInternals]);

  const rowIndex = new Map(data.rows.map((r, i) => [r.index, i]));
  return (
    <div className={`map-node registers-node${data.emphasis === "dim" ? " map-dim" : ""}`} style={{ width: REG_W }} role="group" aria-label="Registers">
      <div className="map-node-header" style={{ height: REG_HEADER_H }}>
        <strong>Registers</strong>
        <button type="button" className="nodrag nopan mini-button" onClick={data.onToggleAll} aria-pressed={data.showAll}>
          {data.showAll ? "Active only" : "Show all"}
        </button>
      </div>
      {data.rows.map((r) => (
        <div key={r.index} className={`reg-row${r.changed ? " changed" : ""}`} style={{ height: REG_ROW_H }} title={r.changed ? `${r.name} changed` : r.name}>
          <span className="reg-name">{r.name}</span>
          <span className="reg-value">{formatWord(r.value, data.numberFormat)}</span>
          {r.changed ? <span className="changed-flag" aria-label="changed">changed</span> : <span />}
        </div>
      ))}
      <div className="reg-special">
        <div className="reg-row" style={{ height: REG_ROW_H }}>
          <span className="reg-name">pc</span>
          <span className="reg-value">{hex32(data.special.pc)}</span>
          <span />
        </div>
        <div className={`reg-row${data.special.hiChanged ? " changed" : ""}`} style={{ height: REG_ROW_H }}>
          <span className="reg-name">hi</span>
          <span className="reg-value">{formatWord(data.special.hi, data.numberFormat)}</span>
          {data.special.hiChanged ? <span className="changed-flag">changed</span> : <span />}
        </div>
        <div className={`reg-row${data.special.loChanged ? " changed" : ""}`} style={{ height: REG_ROW_H }}>
          <span className="reg-name">lo</span>
          <span className="reg-value">{formatWord(data.special.lo, data.numberFormat)}</span>
          {data.special.loChanged ? <span className="changed-flag">changed</span> : <span />}
        </div>
      </div>
      {data.sources.map((idx) => {
        const row = rowIndex.get(idx);
        if (row === undefined) return null;
        return (
          <Handle
            key={idx}
            id={`reg:${idx}`}
            type="source"
            position={Position.Right}
            style={{ top: REG_HEADER_H + row * REG_ROW_H + REG_ROW_H / 2 }}
          />
        );
      })}
    </div>
  );
});

function CardCells({ data }: { data: CardNodeData }) {
  const { card, mode, range, numberFormat } = data;
  const targeted = new Set(data.targetedOffsets);
  const cells: React.ReactNode[] = [];

  if (mode === "words") {
    for (let off = range.start; off + 4 <= range.end; off += 4) {
      const value = readWordUnsigned(card.bytes, off);
      const changed = card.changed[off] || card.changed[off + 1] || card.changed[off + 2] || card.changed[off + 3];
      const isTarget = [0, 1, 2, 3].some((k) => targeted.has(off + k));
      cells.push(
        <div
          key={off}
          className={`cell word-cell${changed ? " changed" : ""}${isTarget ? " targeted" : ""}`}
          style={{ height: GEOMETRY.words.rowH }}
          title={`${card.labels[0] ?? "memory"} + ${off}: ${hex32(value)}${changed ? " (changed)" : ""}`}
        >
          <span className="cell-offset">+{off}</span>
          <span className="cell-value">{formatWord(value, numberFormat)}</span>
          <span className="cell-chars">
            {Array.from(card.bytes.subarray(off, off + 4), (b) => {
              const a = asciiCell(b);
              return a.kind === "char" ? a.text : a.kind === "zero" ? "∅" : "·";
            }).join("")}
          </span>
          {changed ? <span className="changed-flag" aria-label="changed">changed</span> : null}
        </div>,
      );
    }
  } else {
    const g = GEOMETRY[mode];
    for (let off = range.start; off < range.end; off++) {
      const b = card.bytes[off]!;
      const changed = card.changed[off] === 1;
      const isTarget = targeted.has(off);
      if (mode === "bytes") {
        cells.push(
          <div
            key={off}
            className={`cell byte-cell${changed ? " changed" : ""}${isTarget ? " targeted" : ""}`}
            style={{ width: g.cellW, height: g.rowH }}
            title={`${card.labels[0] ?? "memory"}[${off}] = ${b}${changed ? " (changed)" : ""}`}
          >
            <span className="cell-offset">{off}</span>
            <span className="cell-value">{formatByte(b, numberFormat)}</span>
          </div>,
        );
      } else {
        const a = asciiCell(b);
        cells.push(
          <div
            key={off}
            className={`cell ascii-cell ascii-${a.kind}${changed ? " changed" : ""}${isTarget ? " targeted" : ""}`}
            style={{ width: g.cellW, height: g.rowH }}
            title={`${card.labels[0] ?? "memory"}[${off}] = ${b}${changed ? " (changed)" : ""}`}
          >
            <span className="cell-offset">{off}</span>
            <span className="cell-value">{a.text}</span>
          </div>,
        );
      }
    }
  }
  return <div className={`cells cells-${mode}`}>{cells}</div>;
}

const CardNode = memo(function CardNode({ id, data }: NodeProps<CardNodeType>) {
  const { card, mode, range } = data;
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = [
    mode,
    range.start,
    range.end,
    data.targets.map((t) => t.handle).join(","),
    data.sources.join(","),
  ].join("|");
  useEffect(() => {
    updateNodeInternals(id);
  }, [handleKey, id, updateNodeInternals]);

  const g = GEOMETRY[mode];
  const modes = availableModes(card);
  const pages = Math.max(1, Math.ceil(card.bytes.length / g.pageBytes));
  const title = card.labels.length > 0 ? card.labels.join(" / ") : `${card.directive} (line ${card.line})`;
  const seen = new Set<string>();

  return (
    <div
      className={`map-node card-node${data.emphasis === "dim" ? " map-dim" : ""}${card.kind === "stack" ? " stack-node" : ""}`}
      style={{ width: CARD_W }}
      role="group"
      aria-label={`Memory: ${title}`}
    >
      <div className="map-node-header card-header" style={{ height: CARD_HEADER_H }}>
        <div className="card-title" title={title}>
          {title}
        </div>
        <div className="card-meta">
          {hex32(card.start)} · {card.length} byte{card.length === 1 ? "" : "s"}
          {card.kind === "stack" ? " · stack (grows down)" : ` · ${card.directive}`}
        </div>
      </div>
      <div className="card-bar nodrag nopan" style={{ height: CARD_BAR_H }} role="group" aria-label="View mode">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            className={`mini-button${m === mode ? " active" : ""}`}
            aria-pressed={m === mode}
            onClick={() => data.onUi(card.nodeId, { mode: m, page: 0 })}
          >
            {m === "bytes" ? "Bytes" : m === "words" ? "Words" : "ASCII"}
          </button>
        ))}
      </div>
      <CardCells data={data} />
      {hasMoreRow(card, range) ? (
        <div className="card-more nodrag nopan" style={{ height: CARD_MORE_H }}>
          {data.expanded ? (
            <>
              <button type="button" className="mini-button" disabled={data.page <= 0} onClick={() => data.onUi(card.nodeId, { page: data.page - 1 })} aria-label="Previous range">
                ‹
              </button>
              <span>
                bytes {range.start}–{range.end - 1} of {card.length}
                {card.truncated ? "+" : ""}
              </span>
              <button type="button" className="mini-button" disabled={data.page >= pages - 1} onClick={() => data.onUi(card.nodeId, { page: data.page + 1 })} aria-label="Next range">
                ›
              </button>
              <button type="button" className="mini-button" onClick={() => data.onUi(card.nodeId, { expanded: false, page: 0 })}>
                Collapse
              </button>
            </>
          ) : (
            <>
              <span>… {card.length - range.end} more bytes</span>
              <button type="button" className="mini-button" onClick={() => data.onUi(card.nodeId, { expanded: true, page: 0 })}>
                Expand
              </button>
            </>
          )}
        </div>
      ) : null}
      {data.targets.map((t) => {
        if (seen.has(t.handle)) return null;
        seen.add(t.handle);
        return (
          <Handle
            key={t.handle}
            id={t.handle}
            type="target"
            position={Position.Left}
            style={{ top: handleY(card, mode, range, t.handle, t.offset) }}
          />
        );
      })}
      {data.sources.map((off) => (
        <Handle
          key={`src:${off}`}
          id={`src:${off}`}
          type="source"
          position={Position.Right}
          style={{ top: handleY(card, mode, range, `src:${off}`, off) }}
        />
      ))}
    </div>
  );
});

const CodeNode = memo(function CodeNode({ data }: NodeProps<CodeNodeType>) {
  return (
    <div className={`map-node code-node${data.emphasis === "dim" ? " map-dim" : ""}`} role="group" aria-label={`Code: ${data.target.label}`}>
      <Handle id="dst:code" type="target" position={Position.Left} />
      <div className="code-title">{data.target.host ? "host return" : `code: ${data.target.label}`}</div>
      <div className="card-meta">{hex32(data.target.address)}</div>
    </div>
  );
});

const nodeTypes = { card: CardNode, registers: RegistersNode, code: CodeNode };
const edgeTypes = { pointer: PointerEdge };

// ---- Map ----
export interface MemoryMapProps {
  snapshot: Snapshot;
  numberFormat: NumberFormat;
  /** Changes when a different exercise is loaded; resets layout bookkeeping. */
  resetKey: string;
}

function MemoryMapInner({ snapshot, numberFormat, resetKey }: MemoryMapProps) {
  const model = useMemo(() => buildGraphModel(snapshot), [snapshot]);
  const [showAllRegisters, setShowAllRegisters] = useState(false);
  const [cardUi, setCardUi] = useState<Record<string, CardUi>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const moved = useRef(new Set<string>());
  const { fitView } = useReactFlow();

  const onUi = useCallback((nodeId: string, patch: CardUi) => {
    setCardUi((prev) => ({ ...prev, [nodeId]: { ...prev[nodeId], ...patch } }));
  }, []);

  // New exercise: forget manual positions and per-card UI state.
  useEffect(() => {
    moved.current = new Set();
    setCardUi({});
    setSelected(null);
    setShowAllRegisters(false);
  }, [resetKey]);

  const connected = useMemo(() => {
    if (!selected) return null;
    const ids = new Set<string>([selected]);
    for (const e of model.edges) {
      if (e.source.nodeId === selected || e.target.nodeId === selected) {
        ids.add(e.source.nodeId);
        ids.add(e.target.nodeId);
      }
    }
    return ids;
  }, [selected, model.edges]);

  // Rebuild nodes from the model, keeping measured sizes and manual positions.
  useEffect(() => {
    const registerSources = model.edges.filter((e) => e.fromRegister).map((e) => Number(e.source.handle.slice(4)));
    const sourcesByCard = new Map<string, number[]>();
    const targetsByCard = new Map<string, Array<{ handle: string; offset: number }>>();
    for (const e of model.edges) {
      if (!e.fromRegister) {
        sourcesByCard.set(e.source.nodeId, [...(sourcesByCard.get(e.source.nodeId) ?? []), e.source.offset]);
      }
      if (e.target.handle !== "dst:code") {
        targetsByCard.set(e.target.nodeId, [...(targetsByCard.get(e.target.nodeId) ?? []), { handle: e.target.handle, offset: e.target.offset }]);
      }
    }

    const visibleRows = model.registers.filter((r) => {
      if (showAllRegisters) return true;
      if (r.index === 0) return false;
      return r.value !== 0 || r.changed || registerSources.includes(r.index);
    });

    const dim = (id: string): "normal" | "dim" => (connected && !connected.has(id) ? "dim" : "normal");
    const auto = new Map<string, { x: number; y: number }>();
    const built: MapNode[] = [];

    built.push({
      id: REGISTERS_NODE_ID,
      type: "registers",
      position: { x: 0, y: 0 },
      draggable: true,
      data: {
        rows: visibleRows,
        showAll: showAllRegisters,
        special: model.special,
        numberFormat,
        sources: [...new Set(registerSources)],
        emphasis: dim(REGISTERS_NODE_ID),
        onToggleAll: () => setShowAllRegisters((v) => !v),
      },
    });
    auto.set(REGISTERS_NODE_ID, { x: 0, y: 0 });

    let y = 0;
    const cardColumnX = REG_W + 156;
    const dataCards = model.cards.filter((c) => c.kind === "data");
    const stackCard = model.cards.find((c) => c.kind === "stack");
    for (const card of [...dataCards, ...(stackCard ? [stackCard] : [])]) {
      const ui = cardUi[card.nodeId];
      const mode = effectiveMode(card, ui);
      const range = computeRange(card, mode, ui);
      const targets = targetsByCard.get(card.nodeId) ?? [];
      const targeted = targets.filter((t) => t.offset >= 0 && t.handle !== "dst:end").map((t) => t.offset);
      auto.set(card.nodeId, { x: cardColumnX, y });
      built.push({
        id: card.nodeId,
        type: "card",
        position: { x: cardColumnX, y },
        data: {
          card,
          mode,
          range,
          expanded: ui?.expanded ?? false,
          page: ui?.page ?? 0,
          numberFormat,
          targets,
          sources: [...new Set(sourcesByCard.get(card.nodeId) ?? [])],
          targetedOffsets: targeted,
          emphasis: dim(card.nodeId),
          onUi,
        },
      });
      y += cardHeight(card, mode, range) + GAP;
    }

    let codeY = 0;
    const codeX = cardColumnX + CARD_W + 132;
    for (const target of model.codeTargets) {
      auto.set(target.nodeId, { x: codeX, y: codeY });
      built.push({
        id: target.nodeId,
        type: "code",
        position: { x: codeX, y: codeY },
        data: { target, emphasis: dim(target.nodeId) },
      });
      codeY += 70;
    }

    setNodes((old) => {
      const prev = new Map(old.map((n) => [n.id, n]));
      return built.map((n) => {
        const before = prev.get(n.id);
        return {
          ...n,
          position: moved.current.has(n.id) && before ? before.position : auto.get(n.id)!,
          measured: before?.measured,
          selected: n.id === selected,
        } as MapNode;
      });
    });
  }, [model, cardUi, numberFormat, showAllRegisters, connected, selected, onUi]);

  const onNodesChange: OnNodesChange<MapNode> = useCallback((changes) => {
    for (const c of changes) {
      // Dragging only changes presentation; it never touches simulated memory.
      if (c.type === "position" && c.dragging) moved.current.add(c.id);
    }
    setNodes((ns) => changes.applyTo(ns));
  }, []);

  const edges: PointerEdgeType[] = useMemo(
    () =>
      model.edges.map((e) => {
        const touches = selected !== null && (e.source.nodeId === selected || e.target.nodeId === selected);
        const emphasis = selected === null ? "normal" : touches ? "highlight" : "dim";
        return {
          id: e.id,
          type: "pointer",
          source: e.source.nodeId,
          sourceHandle: e.source.handle,
          target: e.target.nodeId,
          targetHandle: e.target.handle,
          markerEnd: { type: MarkerType.ArrowClosed, color: TONE_COLORS[e.tone], width: 16, height: 16 },
          data: { label: e.label, tone: e.tone, emphasis },
        } satisfies PointerEdgeType;
      }),
    [model.edges, selected],
  );

  // Fit the view when a new exercise is loaded (after its first layout).
  useEffect(() => {
    const t = setTimeout(() => void fitView({ padding: 0.15, duration: 0 }), 60);
    return () => clearTimeout(t);
  }, [resetKey, fitView]);

  return (
    <ReactFlow<MapNode, PointerEdgeType>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => setSelected((s) => (s === node.id ? null : node.id))}
      onPaneClick={() => setSelected(null)}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.2}
      maxZoom={1.75}
      nodesConnectable={false}
      elementsSelectable
      aria-label="Memory and register graph"
    >
      <Background gap={20} />
      <Controls showInteractive={false} fitViewOptions={{ padding: 0.15 }} />
    </ReactFlow>
  );
}

export default function MemoryMap(props: MemoryMapProps) {
  return (
    <div className="memory-map" data-testid="memory-map">
      <ReactFlowProvider>
        <MemoryMapInner {...props} />
      </ReactFlowProvider>
      <div className="map-legend" aria-hidden="true">
        <span className="legend-item"><i className="legend-line solid" /> tracked pointer</span>
        <span className="legend-item"><i className="legend-line dashed" /> untracked value that equals an address</span>
        <span className="legend-item"><i className="legend-line danger" /> out of bounds</span>
      </div>
    </div>
  );
}
