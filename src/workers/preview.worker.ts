/// <reference lib="webworker" />
import { assemble } from "../mips/assembler";
import { Machine } from "../mips/machine";
import { takeSnapshot } from "../mips/snapshot";
import type { PreviewOutcome, PreviewRequest, PreviewResponse } from "./protocol";
import { runCooperatively } from "./runner";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** The newest request id seen; older in-flight runs retire themselves. */
let latestRequestId = -1;

async function execute(req: PreviewRequest): Promise<PreviewOutcome> {
  const assembled = assemble(req.source);
  if (!assembled.ok) return { status: "assembly-error", diagnostics: assembled.diagnostics };

  const machine = new Machine(assembled.program, { input: req.stdin });
  const initial = takeSnapshot(machine);
  const cancelled = () => latestRequestId !== req.requestId;

  if (req.mode.kind === "run") {
    const finished = await runCooperatively(machine, cancelled);
    if (finished === "cancelled") return { status: "cancelled" };
    const snapshot = takeSnapshot(machine, initial);
    if (machine.status === "fault" && machine.fault) {
      return { status: "fault", fault: machine.fault, snapshot, initial };
    }
    return { status: "ok", snapshot, initial };
  }

  // Step mode: always start from a fresh initial state and advance `count` steps.
  const { count, expanded } = req.mode;
  const advance = () => (expanded ? machine.step() : machine.stepSource());
  let taken = 0;
  while (taken < count - 1 && machine.status === "running") {
    advance();
    taken++;
    if (taken % 1024 === 0 && cancelled()) return { status: "cancelled" };
  }
  const previous = takeSnapshot(machine, initial);
  if (taken < count && machine.status === "running") {
    advance();
    taken++;
  }
  const snapshot = takeSnapshot(machine, previous);
  const finished = machine.status !== "running";
  if (machine.status === "fault" && machine.fault) {
    return { status: "fault", fault: machine.fault, snapshot, initial };
  }
  return { status: "ok", snapshot, initial, step: { stepsTaken: taken, finished } };
}

ctx.onmessage = (event: MessageEvent<PreviewRequest>) => {
  const req = event.data;
  if (req.type !== "preview") return;
  latestRequestId = req.requestId;
  const started = performance.now();
  void execute(req)
    .catch((e: unknown): PreviewOutcome => ({ status: "error", message: e instanceof Error ? e.message : String(e) }))
    .then((outcome) => {
      const response: PreviewResponse = {
        type: "preview-result",
        requestId: req.requestId,
        problemKey: req.problemKey,
        sourceRevision: req.sourceRevision,
        inputRevision: req.inputRevision,
        outcome,
        elapsedMs: performance.now() - started,
      };
      ctx.postMessage(response);
    });
};
