import { useEffect, useRef } from "react";
import type { Diagnostic } from "../mips/types";
import { MIPS_LANGUAGE_ID, MIPS_THEME } from "./mipsLanguage";
import { monaco } from "./monaco";

export interface AssemblyEditorProps {
  /** Identity of the document; changing it replaces the text with `value`. */
  docKey: string;
  value: string;
  onChange(value: string): void;
  diagnostics: Diagnostic[];
  /** 1-based source line of the current instruction while stepping. */
  currentLine: number | null;
}

/** Monaco lifecycle: one editor, one model per mount, disposed on unmount. */
export default function AssemblyEditor({ docKey, value, onChange, diagnostics, currentLine }: AssemblyEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const onChangeRef = useRef(onChange);
  const lastDocKey = useRef(docKey);
  const applyingExternal = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const model = monaco.editor.createModel(value, MIPS_LANGUAGE_ID);
    const editor = monaco.editor.create(container, {
      model,
      theme: MIPS_THEME,
      automaticLayout: true,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
      fontSize: 17,
      lineNumbers: "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 8,
      insertSpaces: true,
      detectIndentation: false,
      matchBrackets: "always",
      renderWhitespace: "none",
      bracketPairColorization: { enabled: true },
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      accessibilitySupport: "auto",
      ariaLabel: "MIPS assembly editor",
      padding: { top: 10 },
      smoothScrolling: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      cursorSmoothCaretAnimation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "on",
    });
    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection();
    const sub = model.onDidChangeContent(() => {
      if (applyingExternal.current) return;
      onChangeRef.current(model.getValue());
    });
    return () => {
      sub.dispose();
      decorationsRef.current?.clear();
      decorationsRef.current = null;
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
    // The editor is created once; later value changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace the document when a different exercise is loaded.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || lastDocKey.current === docKey) return;
    lastDocKey.current = docKey;
    const model = editor.getModel();
    if (!model) return;
    applyingExternal.current = true;
    model.setValue(value);
    applyingExternal.current = false;
    // Programmatic replacement should not be undoable into the previous exercise.
    editor.setScrollTop(0);
  }, [docKey, value]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const markers: monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
      severity: d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.col,
      endLineNumber: d.line,
      endColumn: Math.max(d.endCol, d.col + 1),
      source: "assembler",
    }));
    monaco.editor.setModelMarkers(model, "mips-assembler", markers);
  }, [diagnostics]);

  useEffect(() => {
    const collection = decorationsRef.current;
    if (!collection) return;
    if (currentLine === null || currentLine <= 0) {
      collection.clear();
      return;
    }
    collection.set([
      {
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: {
          isWholeLine: true,
          className: "current-instruction-line",
          glyphMarginClassName: "current-instruction-glyph",
          linesDecorationsClassName: "current-instruction-bar",
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);
    editorRef.current?.revealLineInCenterIfOutsideViewport(currentLine);
  }, [currentLine]);

  return <div ref={containerRef} className="editor-host" data-testid="assembly-editor" />;
}
