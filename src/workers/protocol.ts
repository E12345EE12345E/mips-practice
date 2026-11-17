import type { SuiteResult } from "../grading/runSuite";
import type { Diagnostic, Fault } from "../mips/types";
import type { Snapshot } from "../mips/snapshot";

/** Identity carried through every preview request and response. */
export interface PreviewIdentity {
  requestId: number;
  problemKey: string;
  sourceRevision: number;
  inputRevision: number;
}

export type PreviewMode =
  | { kind: "run" }
  /** Fresh machine advanced `count` steps; `expanded` steps normalized instructions. */
  | { kind: "step"; count: number; expanded: boolean };

export interface PreviewRequest extends PreviewIdentity {
  type: "preview";
  source: string;
  stdin: string;
  mode: PreviewMode;
}

export type PreviewOutcome =
  | { status: "assembly-error"; diagnostics: Diagnostic[] }
  | {
      status: "ok";
      snapshot: Snapshot;
      /** State before execution (assembled data view, and the baseline for changed flags). */
      initial: Snapshot;
      /** Present in step mode. */
      step?: { stepsTaken: number; finished: boolean };
    }
  | { status: "fault"; fault: Fault; snapshot: Snapshot; initial: Snapshot }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export interface PreviewResponse extends PreviewIdentity {
  type: "preview-result";
  outcome: PreviewOutcome;
  elapsedMs: number;
}

export interface GradeIdentity {
  requestId: number;
  problemKey: string;
  sourceRevision: number;
}

export interface GradeRequest extends GradeIdentity {
  type: "grade";
  typeId: string;
  typeVersion: number;
  params: unknown;
  source: string;
}

export interface InitProblemRequest {
  type: "init";
  problemKey: string;
  typeId: string;
  typeVersion: number;
  params: unknown;
}

export type GradeOutcome = { status: "done"; result: SuiteResult } | { status: "error"; message: string };

export interface GradeResponse extends GradeIdentity {
  type: "grade-result";
  outcome: GradeOutcome;
  elapsedMs: number;
}

export type PreviewWorkerIn = PreviewRequest;
export type PreviewWorkerOut = PreviewResponse;
export type GraderWorkerIn = GradeRequest | InitProblemRequest;
export type GraderWorkerOut = GradeResponse;
