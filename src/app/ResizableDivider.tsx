import { useCallback, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { clamp } from "../state/session";

interface Props {
  /** "vertical" separates left/right panes; "horizontal" separates top/bottom panes. */
  orientation: "vertical" | "horizontal";
  /** Current position in percent of the container. */
  value: number;
  min: number;
  max: number;
  onChange(percent: number): void;
  containerRef: RefObject<HTMLElement | null>;
  label: string;
}

/** Pointer- and keyboard-operable splitter (`role="separator"`). */
export default function ResizableDivider({ orientation, value, min, max, onChange, containerRef, label }: Props) {
  const dragging = useRef(false);

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const percent =
        orientation === "vertical" ? ((clientX - rect.left) / rect.width) * 100 : ((clientY - rect.top) / rect.height) * 100;
      onChange(clamp(percent, min, max));
    },
    [containerRef, max, min, onChange, orientation],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) update(e.clientX, e.clientY);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    const decrease = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const increase = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    if (e.key === decrease) onChange(clamp(value - step, min, max));
    else if (e.key === increase) onChange(clamp(value + step, min, max));
    else if (e.key === "Home") onChange(min);
    else if (e.key === "End") onChange(max);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={`divider divider-${orientation}`}
      role="separator"
      aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
