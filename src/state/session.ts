import { restoreProblem, type PublicProblem } from "../problems/instance";

/**
 * Versioned local persistence (plan section 3). Only public problem
 * parameters, drafts, preview input, and layout are stored. Hidden test values,
 * seeds, expected output, and execution traces are never written.
 */
export const STORAGE_KEY = "mips-practice:session";
export const SCHEMA_VERSION = 1;
const MAX_DRAFTS = 10;

export type NumberFormat = "dec" | "hex";

export interface LayoutState {
  /** Width of the left column, in percent. */
  columnPercent: number;
  /** Share of the left column used by the prompt, in percent. */
  promptPercent: number;
}

export interface SavedDraft {
  /** Public problem identity so the draft can be restored (hidden suite is regenerated). */
  problem: PublicProblem;
  typeId: string;
  source: string;
  savedAt: number;
}

export interface PersistedSession {
  version: typeof SCHEMA_VERSION;
  problem: PublicProblem;
  source: string;
  previewStdin: string;
  autoPreview: boolean;
  numberFormat: NumberFormat;
  layout: LayoutState;
  drafts: Record<string, SavedDraft>;
}

export const DEFAULT_LAYOUT: LayoutState = { columnPercent: 42, promptPercent: 40 };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeLayout(raw: unknown): LayoutState {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<LayoutState>;
  return {
    columnPercent: clamp(typeof r.columnPercent === "number" ? r.columnPercent : DEFAULT_LAYOUT.columnPercent, 20, 70),
    promptPercent: clamp(typeof r.promptPercent === "number" ? r.promptPercent : DEFAULT_LAYOUT.promptPercent, 15, 80),
  };
}

/** Parse and validate stored JSON; returns null for anything unusable. */
export function parsePersisted(json: string | null): PersistedSession | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<PersistedSession>;
  if (r.version !== SCHEMA_VERSION) return null;
  const problem = restoreProblem(r.problem);
  if (!problem || typeof r.source !== "string") return null;

  const drafts: Record<string, SavedDraft> = {};
  if (typeof r.drafts === "object" && r.drafts !== null) {
    for (const [key, d] of Object.entries(r.drafts)) {
      const restored = d ? restoreProblem((d as Partial<SavedDraft>).problem) : null;
      if (d && restored && typeof d.typeId === "string" && typeof d.source === "string" && typeof d.savedAt === "number") {
        drafts[key] = { problem: restored, typeId: d.typeId, source: d.source, savedAt: d.savedAt };
      }
    }
  }
  return {
    version: SCHEMA_VERSION,
    problem,
    source: r.source,
    previewStdin: typeof r.previewStdin === "string" ? r.previewStdin : problem.previewStdin,
    autoPreview: r.autoPreview !== false,
    numberFormat: r.numberFormat === "hex" ? "hex" : "dec",
    layout: sanitizeLayout(r.layout),
    drafts,
  };
}

/** Keep only the newest drafts. */
export function pruneDrafts(drafts: Record<string, SavedDraft>): Record<string, SavedDraft> {
  const entries = Object.entries(drafts).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_DRAFTS);
  return Object.fromEntries(entries);
}

export function loadSession(storage: Pick<Storage, "getItem"> | null = safeStorage()): PersistedSession | null {
  try {
    return parsePersisted(storage ? storage.getItem(STORAGE_KEY) : null);
  } catch {
    return null;
  }
}

export function saveSession(
  session: PersistedSession,
  storage: Pick<Storage, "setItem"> | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...session, drafts: pruneDrafts(session.drafts) }));
  } catch {
    // Storage may be full or disabled; persistence is best-effort.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Render stdout bytes with visible escapes so exact output (e.g. a trailing newline) can be seen. */
export function visibleOutput(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === "\n") out += "↵\n";
    else if (ch === "\t") out += "→";
    else if (code < 32 || code === 127) out += `\\x${code.toString(16).padStart(2, "0")}`;
    else if (code > 126) out += `\\x${code.toString(16).padStart(2, "0")}`;
    else out += ch;
  }
  return out;
}
