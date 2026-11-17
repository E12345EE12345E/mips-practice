import { describe, expect, it } from "vitest";
import { createProblem } from "../../src/problems/instance";
import { PROBLEM_TYPES } from "../../src/problems/registry";
import {
  DEFAULT_LAYOUT,
  SCHEMA_VERSION,
  STORAGE_KEY,
  loadSession,
  parsePersisted,
  saveSession,
  visibleOutput,
  type PersistedSession,
} from "../../src/state/session";

function makeSession(): PersistedSession {
  const problem = createProblem("string-echo");
  return {
    version: SCHEMA_VERSION,
    problem,
    source: "main:\n  li $v0, 10\n  syscall\n",
    previewStdin: "hello\n",
    autoPreview: true,
    numberFormat: "dec",
    layout: DEFAULT_LAYOUT,
    drafts: {},
  };
}

describe("persistence", () => {
  it("round-trips a session through storage", () => {
    const store = new Map<string, string>();
    const session = makeSession();
    saveSession(session, { setItem: (k, v) => void store.set(k, v) });
    const loaded = loadSession({ getItem: (k) => store.get(k) ?? null });
    expect(loaded?.source).toBe(session.source);
    expect(loaded?.problem.typeId).toBe("string-echo");
  });

  it("never serializes hidden-suite material", () => {
    const store = new Map<string, string>();
    saveSession(makeSession(), { setItem: (k, v) => void store.set(k, v) });
    const json = (store.get(STORAGE_KEY) ?? "").toLowerCase();
    expect(json).not.toMatch(/hidden|seed|trace|expected|suite/);
  });

  it.each([null, "", "not json", "[]", "null", `{"version":999}`, `{"version":${SCHEMA_VERSION}}`])(
    "rejects unusable stored value %j",
    (value) => {
      expect(parsePersisted(value)).toBeNull();
    },
  );

  it("rejects a draft with tampered problem parameters", () => {
    const session = makeSession();
    const raw = JSON.parse(JSON.stringify(session));
    raw.problem.params = { n: -5 };
    expect(parsePersisted(JSON.stringify(raw))).toBeNull();
  });

  it("clamps out-of-range layout values", () => {
    const raw = JSON.parse(JSON.stringify(makeSession()));
    raw.layout = { columnPercent: 1000, promptPercent: -3 };
    const parsed = parsePersisted(JSON.stringify(raw));
    expect(parsed?.layout.columnPercent).toBe(70);
    expect(parsed?.layout.promptPercent).toBe(15);
  });

  it("creates every registered family", () => {
    for (const entry of PROBLEM_TYPES) expect(createProblem(entry.id).typeId).toBe(entry.id);
  });
});

describe("visibleOutput", () => {
  it("makes trailing newlines visible", () => {
    expect(visibleOutput("a\n")).toContain("↵");
    expect(visibleOutput("a")).toBe("a");
  });
});
