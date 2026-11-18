import { useEffect, useState } from "react";
import type { NumberFormat } from "../state/session";

/** Latin Extended-B / IPA glyphs used as cycling uninitialized "garbage". */
const POOL_START = 0x023a;
const POOL_END = 0x02af;
const POOL_SIZE = POOL_END - POOL_START + 1;
const HZ = 6;

function mix(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return (n ^ (n >>> 16)) >>> 0;
}

/** Glyph count matching the typical width of a formatted register word. */
export function uninitWidth(format: NumberFormat): number {
  return format === "hex" ? 10 : 11;
}

export function uninitGlyphs(seed: number, tick: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    const a = mix(seed * 0x9e3779b9 + i * 0x85ebca6b + tick * 0xc2b2ae35);
    const b = mix(seed * 0x9e3779b9 + i * 0x85ebca6b + (tick - 1) * 0xc2b2ae35);
    let idx = a % POOL_SIZE;
    if (idx === b % POOL_SIZE) idx = (idx + 1) % POOL_SIZE;
    out += String.fromCodePoint(POOL_START + idx);
  }
  return out;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Shared 6 Hz tick for uninitialized cells. Disabled when `enabled` is false. */
export function useUninitTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000 / HZ);
    return () => window.clearInterval(id);
  }, [enabled]);
  return tick;
}

export function UninitializedValue({ seed, tick, length }: { seed: number; tick: number; length: number }) {
  const text = uninitGlyphs(seed, tick, length);
  return (
    <span className="uninit-value" aria-label="uninitialized">
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
