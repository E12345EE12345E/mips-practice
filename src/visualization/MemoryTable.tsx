import { useState } from "react";
import type { Snapshot } from "../mips/snapshot";
import type { NumberFormat } from "../state/session";
import { asciiString, formatWord, hex32, hex8 } from "./format";
import { buildGraphModel } from "./buildGraph";
import {
  UninitializedValue,
  uninitWidth,
  usePrefersReducedMotion,
  useUninitTick,
} from "./UninitializedValue";

function RegisterValue({
  written,
  value,
  numberFormat,
  seed,
  tick,
}: {
  written: boolean;
  value: number;
  numberFormat: NumberFormat;
  seed: number;
  tick: number;
}) {
  if (written) return formatWord(value, numberFormat);
  return <UninitializedValue seed={seed} tick={tick} length={uninitWidth(numberFormat)} />;
}

/** Textual register and memory tables shown alongside (or instead of) the graph. */
export default function MemoryTable({ snapshot, numberFormat }: { snapshot: Snapshot; numberFormat: NumberFormat }) {
  const model = buildGraphModel(snapshot);
  const [showUnused, setShowUnused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const visibleRegs = snapshot.registers.filter((r) => showUnused || r.used);
  const showHi = showUnused || snapshot.hiUsed;
  const showLo = showUnused || snapshot.loUsed;
  const hasUninit =
    visibleRegs.some((r) => !r.written) ||
    (showHi && !snapshot.hiWritten) ||
    (showLo && !snapshot.loWritten);
  const tick = useUninitTick(hasUninit && !reducedMotion);
  const targetsByRegister = new Map(
    model.edges.filter((e) => e.fromRegister).map((e) => [Number(e.source.handle.slice(4)), e]),
  );

  return (
    <div className="memory-table" data-testid="memory-table">
      <section aria-labelledby="regs-heading">
        <h3 id="regs-heading">Registers</h3>
        <table>
          <caption className="sr-only">General-purpose registers, program counter, HI and LO</caption>
          <thead>
            <tr>
              <th scope="col">Register</th>
              <th scope="col">Value</th>
              <th scope="col">Points to</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRegs.map((r) => {
              const edge = targetsByRegister.get(r.index);
              return (
                <tr key={r.index} className={r.changed ? "changed" : undefined}>
                  <th scope="row">{r.name}</th>
                  <td>
                    <RegisterValue
                      written={r.written}
                      value={r.value}
                      numberFormat={numberFormat}
                      seed={r.index}
                      tick={tick}
                    />
                  </td>
                  <td>{edge ? `${edge.label}${edge.tone === "untracked" ? " (untracked)" : ""}` : ""}</td>
                  <td>{r.changed ? "changed" : ""}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row">pc</th>
              <td>{hex32(snapshot.pc)}</td>
              <td>{snapshot.pcLine > 0 ? `line ${snapshot.pcLine}` : ""}</td>
              <td />
            </tr>
            {showHi ? (
              <tr className={snapshot.hiChanged ? "changed" : undefined}>
                <th scope="row">hi</th>
                <td>
                  <RegisterValue
                    written={snapshot.hiWritten}
                    value={snapshot.hi}
                    numberFormat={numberFormat}
                    seed={32}
                    tick={tick}
                  />
                </td>
                <td />
                <td>{snapshot.hiChanged ? "changed" : ""}</td>
              </tr>
            ) : null}
            {showLo ? (
              <tr className={snapshot.loChanged ? "changed" : undefined}>
                <th scope="row">lo</th>
                <td>
                  <RegisterValue
                    written={snapshot.loWritten}
                    value={snapshot.lo}
                    numberFormat={numberFormat}
                    seed={33}
                    tick={tick}
                  />
                </td>
                <td />
                <td>{snapshot.loChanged ? "changed" : ""}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="memory-table-toggle">
          <button
            type="button"
            className="mini-button"
            aria-pressed={showUnused}
            onClick={() => setShowUnused((v) => !v)}
          >
            {showUnused ? "Hide unused" : "Show unused"}
          </button>
        </p>
      </section>

      {snapshot.allocations.map((a) => {
        const title = a.labels.length > 0 ? a.labels.join(" / ") : `${a.directive} (line ${a.line})`;
        const rows: number[] = [];
        for (let off = 0; off < a.bytes.length; off += 8) rows.push(off);
        return (
          <section key={a.id} aria-label={`Memory ${title}`}>
            <h3>
              {title}{" "}
              <small>
                {hex32(a.start)} · {a.length} bytes · {a.kind === "stack" ? "stack" : a.directive}
              </small>
            </h3>
            <table>
              <caption className="sr-only">Contents of {title}, eight bytes per row</caption>
              <thead>
                <tr>
                  <th scope="col">Offset</th>
                  <th scope="col">Bytes (hex)</th>
                  <th scope="col">ASCII</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((off) => {
                  const slice = a.bytes.subarray(off, off + 8);
                  const changed = a.changed.subarray(off, off + 8).some((c) => c === 1);
                  return (
                    <tr key={off} className={changed ? "changed" : undefined}>
                      <th scope="row">+{off}</th>
                      <td>{Array.from(slice, (b) => hex8(b)).join(" ")}</td>
                      <td>{asciiString(slice)}</td>
                      <td>{changed ? "changed" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {a.truncated ? <p className="note">Showing the first {a.bytes.length} bytes only.</p> : null}
          </section>
        );
      })}
      {model.omittedCards > 0 ? <p className="note">{model.omittedCards} more allocations are not shown.</p> : null}
    </div>
  );
}
