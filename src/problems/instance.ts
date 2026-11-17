import { deriveStream, randomSeed } from "./random";
import { getProblemType, PROBLEM_TYPES } from "./registry";
import { inputToStdin } from "./shared/input";
import { NO_ERROR_CHECKING_SENTENCE, renderProgram, type CProgram } from "./shared/c";
import type { ProblemEntry, PromptSpec } from "./types";

/**
 * Public problem identity: `typeId + typeVersion + params` reproduces the
 * prompt. The hidden suite seed is NOT part of it and never leaves the grader.
 */
export interface PublicProblem {
  /** Random key for this problem instance (not derived from any seed). */
  key: string;
  typeId: string;
  typeVersion: number;
  params: unknown;
  /** Initial visible sample input (raw stdin text). */
  previewStdin: string;
}

function randomKey(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createProblem(typeId?: string): PublicProblem {
  const entry = typeId ? getProblemType(typeId) : undefined;
  const chosen = entry ?? PROBLEM_TYPES[Math.floor(Math.random() * PROBLEM_TYPES.length)]!;
  // The root seed is used once and discarded; only derived public values persist.
  const seed = randomSeed();
  const params = chosen.generateParams(deriveStream(seed, "params"));
  const preview = chosen.makePreview(params, deriveStream(seed, "preview"));
  return {
    key: randomKey(),
    typeId: chosen.id,
    typeVersion: chosen.version,
    params,
    previewStdin: inputToStdin(preview),
  };
}

/** Validate a stored problem; returns null when it no longer matches a registered family. */
export function restoreProblem(saved: unknown): PublicProblem | null {
  if (typeof saved !== "object" || saved === null) return null;
  const s = saved as Partial<PublicProblem>;
  if (typeof s.typeId !== "string" || typeof s.typeVersion !== "number" || typeof s.key !== "string") return null;
  if (typeof s.previewStdin !== "string") return null;
  const entry = getProblemType(s.typeId);
  if (!entry || entry.version !== s.typeVersion) return null;
  try {
    entry.validateParams(s.params);
  } catch {
    return null;
  }
  return { key: s.key, typeId: s.typeId, typeVersion: s.typeVersion, params: s.params, previewStdin: s.previewStdin };
}

export interface ProblemView {
  entry: ProblemEntry;
  spec: PromptSpec;
  program: CProgram;
  starter: string;
  /** Mandatory sentence shown in every prompt, outside the C snippet. */
  noErrorChecking: string;
}

export function viewProblem(problem: PublicProblem): ProblemView {
  const entry = getProblemType(problem.typeId);
  if (!entry) throw new Error(`Unknown problem type ${problem.typeId}`);
  const spec = entry.describe(problem.params);
  return {
    entry,
    spec,
    program: renderProgram(spec, entry.renderBody(problem.params)),
    starter: entry.starterAssembly(problem.params),
    noErrorChecking: NO_ERROR_CHECKING_SENTENCE,
  };
}
