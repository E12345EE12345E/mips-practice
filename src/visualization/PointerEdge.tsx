import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { EdgeTone } from "./buildGraph";

export interface PointerEdgeData extends Record<string, unknown> {
  label: string;
  tone: EdgeTone;
  /** "dim" when another node is selected and this edge is not connected to it. */
  emphasis: "normal" | "highlight" | "dim";
}

export type PointerEdgeType = Edge<PointerEdgeData, "pointer">;

export const TONE_COLORS: Record<EdgeTone, string> = {
  tracked: "#4fc1ff",
  untracked: "#a8a8a8",
  danger: "#f48771",
};

/** Curved pointer arrow: Bezier path, arrow marker supplied by React Flow, text label. */
export default function PointerEdge(props: EdgeProps<PointerEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const tone = data?.tone ?? "tracked";
  const emphasis = data?.emphasis ?? "normal";
  const color = TONE_COLORS[tone];
  const dashed = tone !== "tracked";
  const opacity = emphasis === "dim" ? 0.2 : 1;
  const width = emphasis === "highlight" ? 3 : 1.75;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: width,
          strokeDasharray: dashed ? "6 4" : undefined,
          opacity,
        }}
      />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className={`edge-label edge-label-${tone}${emphasis === "highlight" ? " edge-label-highlight" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, opacity }}
            data-testid="edge-label"
          >
            {data.label}
            {tone === "untracked" ? " (untracked)" : ""}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
