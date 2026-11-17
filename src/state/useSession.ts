import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SuiteResult } from "../grading/runSuite";
import type { Snapshot } from "../mips/snapshot";
import type { Diagnostic, Fault } from "../mips/types";
import { createProblem, viewProblem, type ProblemView, type PublicProblem } from "../problems/instance";
import { createGraderClient, createPreviewClient, WorkerTimeoutError, type GraderClient } from "../workers/controllers";
import type { WorkerClient } from "../workers/controllers";
import type { PreviewRequest, PreviewResponse } from "../workers/protocol";
import {
  DEFAULT_LAYOUT,
  loadSession,
  saveSession,
  type LayoutState,
  type NumberFormat,
  type SavedDraft,
} from "./session";

export const PREVIEW_DEBOUNCE_MS = 250;

export interface PreviewView {
  snapshot: Snapshot;
  initial: Snapshot;
  problemKey: string;
  sourceRevision: number;
  inputRevision: number;
  elapsedMs: number;
}

export interface FaultView {
  snapshot: Snapshot;
  initial: Snapshot;
  fault: Fault;
  sourceRevision: number;
}

export interface StepView {
  snapshot: Snapshot;
  stepsTaken: number;
  finished: boolean;
  sourceRevision: number;
  fault: Fault | null;
}

export type PreviewStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; elapsedMs: number }
  | { kind: "assembly-error"; diagnostics: Diagnostic[] }
  | { kind: "fault"; fault: Fault }
  | { kind: "error"; message: string };

export type GradeState =
  | { phase: "idle" }
  | { phase: "running"; revision: number }
  | { phase: "done"; revision: number; result: SuiteResult }
  | { phase: "error"; revision: number; message: string };

export type DisplayKind = "final" | "initial" | "fault" | "step";
export type DisplayMode = "final" | "initial" | "fault";

export interface Display {
  kind: DisplayKind;
  snapshot: Snapshot | null;
  /** Human-readable label of what is shown. */
  label: string;
  /** The displayed state does not belong to the current source text. */
  stale: boolean;
  staleReason: string | null;
}

export interface StepState {
  count: number;
  expanded: boolean;
}

function initialSession() {
  const stored = loadSession();
  if (stored) return { ...stored, restored: true };
  const problem = createProblem();
  const view = viewProblem(problem);
  return {
    version: 1 as const,
    problem,
    source: view.starter,
    previewStdin: problem.previewStdin,
    autoPreview: true,
    numberFormat: "dec" as NumberFormat,
    layout: DEFAULT_LAYOUT,
    drafts: {} as Record<string, SavedDraft>,
    restored: false,
  };
}

/** All application state and the revision-aware preview/grading pipelines. */
export function useSession() {
  const [initial] = useState(initialSession);
  const [problem, setProblem] = useState<PublicProblem>(initial.problem);
  const [source, setSource] = useState(initial.source);
  const [sourceRevision, setSourceRevision] = useState(1);
  const [previewStdin, setPreviewStdin] = useState(initial.previewStdin);
  const [inputRevision, setInputRevision] = useState(1);
  const [autoPreview, setAutoPreview] = useState(initial.autoPreview);
  const [numberFormat, setNumberFormat] = useState<NumberFormat>(initial.numberFormat);
  const [layout, setLayout] = useState<LayoutState>(initial.layout);
  const [drafts, setDrafts] = useState<Record<string, SavedDraft>>(initial.drafts);
  const [restoredNote, setRestoredNote] = useState(initial.restored);

  const [lastValid, setLastValid] = useState<PreviewView | null>(null);
  const [status, setStatus] = useState<PreviewStatus>({ kind: "idle" });
  const [faultView, setFaultView] = useState<FaultView | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("final");
  const [stepState, setStepState] = useState<StepState | null>(null);
  const [stepView, setStepView] = useState<StepView | null>(null);
  const [grade, setGrade] = useState<GradeState>({ phase: "idle" });

  // Live identities, updated synchronously so async results can be validated.
  const rev = useRef({ problemKey: initial.problem.key, source: 1, input: 1 });
  const stepRef = useRef<StepState | null>(null);
  const [expandedSteps, setExpandedStepsState] = useState(false);
  const expandedRef = useRef(false);
  const previewClient = useRef<WorkerClient<PreviewRequest, PreviewResponse> | null>(null);
  const graderClient = useRef<GraderClient | null>(null);
  const disposed = useRef(false);
  const sourceRef = useRef(source);
  const stdinRef = useRef(previewStdin);
  const problemRef = useRef(problem);
  sourceRef.current = source;
  stdinRef.current = previewStdin;
  problemRef.current = problem;

  const view: ProblemView = useMemo(() => viewProblem(problem), [problem]);
  const inputError = useMemo(
    () => view.entry.validatePreviewInput(problem.params, previewStdin),
    [view, problem.params, previewStdin],
  );
  const inputErrorRef = useRef(inputError);
  inputErrorRef.current = inputError;

  // Worker lifecycle.
  useEffect(() => {
    disposed.current = false;
    previewClient.current = createPreviewClient();
    graderClient.current = createGraderClient();
    const p = problemRef.current;
    graderClient.current.init({ type: "init", problemKey: p.key, typeId: p.typeId, typeVersion: p.typeVersion, params: p.params });
    return () => {
      disposed.current = true;
      previewClient.current?.dispose();
      graderClient.current?.dispose();
      previewClient.current = null;
      graderClient.current = null;
    };
  }, []);

  const requestPreview = useCallback(() => {
    const client = previewClient.current;
    if (!client || inputErrorRef.current !== null) return;
    const identity = {
      problemKey: rev.current.problemKey,
      sourceRevision: rev.current.source,
      inputRevision: rev.current.input,
    };
    const step = stepRef.current;
    const mode = step ? ({ kind: "step", count: step.count, expanded: step.expanded } as const) : ({ kind: "run" } as const);
    setStatus((s) => (s.kind === "idle" ? { kind: "running" } : s));

    client
      .request({ type: "preview", ...identity, source: sourceRef.current, stdin: stdinRef.current, mode })
      .then((response) => {
        if (disposed.current) return;
        // Retire superseded runs: every identity must still match the live session.
        if (
          response.problemKey !== rev.current.problemKey ||
          response.sourceRevision !== rev.current.source ||
          response.inputRevision !== rev.current.input
        ) {
          return;
        }
        const outcome = response.outcome;
        const stepping = stepRef.current !== null;
        switch (outcome.status) {
          case "assembly-error":
            // Keep the entire prior snapshot (values, arrows, stdout, version label).
            setStatus({ kind: "assembly-error", diagnostics: outcome.diagnostics });
            break;
          case "ok":
            setStatus({ kind: "ok", elapsedMs: response.elapsedMs });
            setFaultView(null);
            if (stepping && outcome.step) {
              setStepView({
                snapshot: outcome.snapshot,
                stepsTaken: outcome.step.stepsTaken,
                finished: outcome.step.finished,
                sourceRevision: response.sourceRevision,
                fault: null,
              });
            } else {
              setLastValid({
                snapshot: outcome.snapshot,
                initial: outcome.initial,
                problemKey: response.problemKey,
                sourceRevision: response.sourceRevision,
                inputRevision: response.inputRevision,
                elapsedMs: response.elapsedMs,
              });
            }
            break;
          case "fault":
            // Keep the last successful preview; expose the fault state for explicit inspection.
            setStatus({ kind: "fault", fault: outcome.fault });
            if (stepping) {
              setStepView({
                snapshot: outcome.snapshot,
                stepsTaken: stepRef.current?.count ?? 0,
                finished: true,
                sourceRevision: response.sourceRevision,
                fault: outcome.fault,
              });
            } else {
              setFaultView({
                snapshot: outcome.snapshot,
                initial: outcome.initial,
                fault: outcome.fault,
                sourceRevision: response.sourceRevision,
              });
            }
            break;
          case "cancelled":
            break;
          case "error":
            setStatus({ kind: "error", message: outcome.message });
            break;
        }
      })
      .catch((e: unknown) => {
        if (disposed.current) return;
        if (identity.sourceRevision !== rev.current.source || identity.problemKey !== rev.current.problemKey) return;
        setStatus({
          kind: "error",
          message: e instanceof WorkerTimeoutError ? e.message : e instanceof Error ? e.message : "Preview failed",
        });
      });
  }, []);

  // Debounced automatic preview (also restarts stepping after a valid edit).
  useEffect(() => {
    const stepping = stepRef.current !== null;
    if (!autoPreview && !stepping) return;
    const timer = setTimeout(() => {
      if (stepRef.current) {
        stepRef.current = { ...stepRef.current, count: 0 };
        setStepState(stepRef.current);
      }
      requestPreview();
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [problem.key, sourceRevision, inputRevision, autoPreview, requestPreview]);

  // ---- Actions ----
  const updateSource = useCallback((text: string) => {
    rev.current.source += 1;
    sourceRef.current = text;
    setSource(text);
    setSourceRevision(rev.current.source);
  }, []);

  const updatePreviewStdin = useCallback(
    (text: string) => {
      setPreviewStdin(text);
      stdinRef.current = text;
      const error = viewProblem(problemRef.current).entry.validatePreviewInput(problemRef.current.params, text);
      inputErrorRef.current = error;
      if (error === null) {
        rev.current.input += 1;
        setInputRevision(rev.current.input);
      }
    },
    [],
  );

  const step = useCallback(() => {
    const next: StepState = { count: (stepRef.current?.count ?? 0) + 1, expanded: expandedRef.current };
    stepRef.current = next;
    setStepState(next);
    setDisplayMode("final");
    requestPreview();
  }, [requestPreview]);

  const setExpandedSteps = useCallback(
    (expanded: boolean) => {
      expandedRef.current = expanded;
      setExpandedStepsState(expanded);
      if (!stepRef.current) return;
      // Changing granularity restarts stepping from the initial state.
      stepRef.current = { count: 0, expanded };
      setStepState(stepRef.current);
      setStepView(null);
      requestPreview();
    },
    [requestPreview],
  );

  /** Leave step mode and return to the final-state view. */
  const reset = useCallback(() => {
    stepRef.current = null;
    setStepState(null);
    setStepView(null);
    setDisplayMode("final");
    requestPreview();
  }, [requestPreview]);

  /** Run now. Leaves step mode first, so it always produces the final-state preview. */
  const runPreview = useCallback(() => {
    if (stepRef.current) reset();
    else requestPreview();
  }, [requestPreview, reset]);

  const resetForNewProblem = useCallback((next: PublicProblem, nextSource: string) => {
    rev.current = { problemKey: next.key, source: rev.current.source + 1, input: rev.current.input + 1 };
    sourceRef.current = nextSource;
    stdinRef.current = next.previewStdin;
    problemRef.current = next;
    stepRef.current = null;
    setProblem(next);
    setSource(nextSource);
    setSourceRevision(rev.current.source);
    setPreviewStdin(next.previewStdin);
    setInputRevision(rev.current.input);
    inputErrorRef.current = null;
    // Problem-specific preview and grading state never carries over.
    setLastValid(null);
    setFaultView(null);
    setStepState(null);
    setStepView(null);
    setStatus({ kind: "idle" });
    setDisplayMode("final");
    setGrade({ phase: "idle" });
    graderClient.current?.init({
      type: "init",
      problemKey: next.key,
      typeId: next.typeId,
      typeVersion: next.typeVersion,
      params: next.params,
    });
  }, []);

  const saveCurrentDraft = useCallback(() => {
    const p = problemRef.current;
    const draft: SavedDraft = { problem: p, typeId: p.typeId, source: sourceRef.current, savedAt: Date.now() };
    setDrafts((d) => ({ ...d, [p.key]: draft }));
  }, []);

  const newProblem = useCallback(
    (typeId?: string) => {
      saveCurrentDraft();
      const next = createProblem(typeId);
      resetForNewProblem(next, viewProblem(next).starter);
      setRestoredNote(false);
    },
    [resetForNewProblem, saveCurrentDraft],
  );

  const restoreDraft = useCallback(
    (key: string) => {
      const draft = drafts[key];
      if (!draft || key === problemRef.current.key) return;
      saveCurrentDraft();
      resetForNewProblem(draft.problem, draft.source);
      setRestoredNote(true);
    },
    [drafts, resetForNewProblem, saveCurrentDraft],
  );

  const resetSourceToStarter = useCallback(() => {
    updateSource(viewProblem(problemRef.current).starter);
  }, [updateSource]);

  const checkSolution = useCallback(() => {
    const client = graderClient.current;
    if (!client) return;
    const p = problemRef.current;
    const revision = rev.current.source;
    setGrade({ phase: "running", revision });
    setRestoredNote(false);
    client
      .grade({
        type: "grade",
        problemKey: p.key,
        sourceRevision: revision,
        typeId: p.typeId,
        typeVersion: p.typeVersion,
        params: p.params,
        source: sourceRef.current,
      })
      .then((response) => {
        if (disposed.current || response.problemKey !== rev.current.problemKey) return;
        setGrade(
          response.outcome.status === "done"
            ? { phase: "done", revision: response.sourceRevision, result: response.outcome.result }
            : { phase: "error", revision: response.sourceRevision, message: response.outcome.message },
        );
      })
      .catch((e: unknown) => {
        if (disposed.current || p.key !== rev.current.problemKey) return;
        setGrade({
          phase: "error",
          revision,
          message: e instanceof Error ? e.message : "Grading failed",
        });
      });
  }, []);

  // ---- Persistence (public values only) ----
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSession({
        version: 1,
        problem,
        source,
        previewStdin,
        autoPreview,
        numberFormat,
        layout,
        drafts,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [problem, source, previewStdin, autoPreview, numberFormat, layout, drafts]);

  // ---- Derived display state ----
  const display: Display = useMemo(() => {
    if (stepState && stepView) {
      const stale = stepView.sourceRevision !== sourceRevision || status.kind === "assembly-error";
      return {
        kind: "step",
        snapshot: stepView.snapshot,
        label: stepView.fault
          ? `Step ${stepView.stepsTaken} (fault)`
          : stepView.finished
            ? `Step ${stepView.stepsTaken} (program finished)`
            : `Step ${stepView.stepsTaken}`,
        stale,
        staleReason: stale ? "Stepping is frozen because the current source does not assemble." : null,
      };
    }
    if (displayMode === "fault" && faultView) {
      return {
        kind: "fault",
        snapshot: faultView.snapshot,
        label: "Fault state (not a normal preview)",
        stale: faultView.sourceRevision !== sourceRevision,
        staleReason: faultView.sourceRevision !== sourceRevision ? "Fault state is from an earlier source version." : null,
      };
    }
    if (lastValid) {
      const outdated = lastValid.sourceRevision !== sourceRevision || lastValid.inputRevision !== inputRevision;
      const initialView = displayMode === "initial";
      return {
        kind: initialView ? "initial" : "final",
        snapshot: initialView ? lastValid.initial : lastValid.snapshot,
        label: initialView ? "Assembled data (before execution)" : "Final state",
        stale: outdated,
        staleReason: !outdated
          ? null
          : status.kind === "assembly-error" || status.kind === "fault"
            ? "Showing last valid preview."
            : "Preview is out of date; run it again.",
      };
    }
    return { kind: "final", snapshot: null, label: "No preview yet", stale: false, staleReason: null };
  }, [stepState, stepView, displayMode, faultView, lastValid, sourceRevision, inputRevision, status]);

  const editorDiagnostics: Diagnostic[] = useMemo(() => {
    if (status.kind === "assembly-error") return status.diagnostics;
    if (status.kind === "fault" && status.fault.line > 0) {
      return [
        {
          severity: "error",
          message: `Runtime fault: ${status.fault.message}`,
          line: status.fault.line,
          col: 1,
          endCol: 200,
        },
      ];
    }
    return [];
  }, [status]);

  const currentLine = stepState && stepView && !stepView.snapshot.fault ? stepView.snapshot.pcLine || null : null;
  const gradeRevision = grade.phase === "idle" ? null : grade.revision;
  const gradeStale = gradeRevision !== null && gradeRevision !== sourceRevision;
  const draftList = useMemo(
    () =>
      Object.entries(drafts)
        .filter(([key]) => key !== problem.key)
        .sort((a, b) => b[1].savedAt - a[1].savedAt),
    [drafts, problem.key],
  );

  return {
    problem,
    view,
    source,
    sourceRevision,
    previewStdin,
    inputError,
    autoPreview,
    numberFormat,
    layout,
    status,
    display,
    lastValid,
    faultView,
    displayMode,
    stepState,
    expandedSteps,
    grade,
    gradeStale,
    editorDiagnostics,
    currentLine,
    restoredNote,
    draftList,
    actions: {
      updateSource,
      updatePreviewStdin,
      runPreview,
      step,
      setExpandedSteps,
      reset,
      newProblem,
      restoreDraft,
      resetSourceToStarter,
      checkSolution,
      setAutoPreview,
      setNumberFormat,
      setLayout,
      setDisplayMode,
      dismissRestoredNote: () => setRestoredNote(false),
    },
  };
}

export type Session = ReturnType<typeof useSession>;
