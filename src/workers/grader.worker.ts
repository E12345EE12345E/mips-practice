/// <reference lib="webworker" />
import { runSuite } from "../grading/runSuite";
import { buildSuite, type HiddenSuite } from "../grading/suite";
import { getProblemType } from "../problems/registry";
import { randomSeed } from "../problems/random";
import type { GradeOutcome, GradeRequest, GradeResponse, GraderWorkerIn, InitProblemRequest } from "./protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/**
 * Hidden suites live only inside this worker, keyed by problem instance. The
 * seed is generated here (never derived from public values) and kept for the
 * lifetime of the problem. This is an execution boundary, not a confidentiality
 * boundary: anyone can inspect the browser's code and memory.
 */
const MAX_SUITES = 4;
const suites = new Map<string, HiddenSuite>();

function suiteFor(req: Pick<InitProblemRequest, "problemKey" | "typeId" | "typeVersion" | "params">): HiddenSuite {
  const existing = suites.get(req.problemKey);
  if (existing) return existing;
  const entry = getProblemType(req.typeId);
  if (!entry || entry.version !== req.typeVersion) {
    throw new Error(`Unknown problem type ${req.typeId} v${req.typeVersion}`);
  }
  const suite = buildSuite(entry, req.params, randomSeed());
  suites.set(req.problemKey, suite);
  while (suites.size > MAX_SUITES) {
    const oldest = suites.keys().next().value;
    if (oldest === undefined) break;
    suites.delete(oldest);
  }
  return suite;
}

function grade(req: GradeRequest): GradeOutcome {
  try {
    const suite = suiteFor(req);
    return { status: "done", result: runSuite(req.source, suite.cases) };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

ctx.onmessage = (event: MessageEvent<GraderWorkerIn>) => {
  const msg = event.data;
  if (msg.type === "init") {
    try {
      suiteFor(msg);
    } catch {
      // Reported when grading is requested.
    }
    return;
  }
  const started = performance.now();
  const outcome = grade(msg);
  const response: GradeResponse = {
    type: "grade-result",
    requestId: msg.requestId,
    problemKey: msg.problemKey,
    sourceRevision: msg.sourceRevision,
    outcome,
    elapsedMs: performance.now() - started,
  };
  ctx.postMessage(response);
};
