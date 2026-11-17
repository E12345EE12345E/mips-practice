import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { DIRECTIVES } from "../mips/directives";
import { INSTRUCTIONS, INSTRUCTION_MAP } from "../mips/instructions";
import { REGISTER_NAMES } from "../mips/registers";
import { SYSCALL_DOCS } from "../mips/syscalls";

export const MIPS_LANGUAGE_ID = "mips";
export const MIPS_THEME = "mips-dark";

/** Instruction names offered by the editor: derived from the assembler's own table. */
export const EDITOR_INSTRUCTION_NAMES: readonly string[] = INSTRUCTIONS.map((i) => i.name);

const LABEL_PATTERN = /^\s*([A-Za-z_][\w.$]*)\s*:/gm;

function instructionDoc(name: string): string | undefined {
  const def = INSTRUCTION_MAP.get(name);
  if (!def) return undefined;
  const forms = def.forms.map((f) => `    ${f.syntax}`).join("\n");
  const kind = def.pseudo ? "pseudo-instruction" : "instruction";
  const syscalls =
    name === "syscall" ? `\n\n${SYSCALL_DOCS.map((s) => `- **${s.code}** ${s.name}`).join("\n")}` : "";
  return `**${name}** (${kind})\n\n${def.summary}\n\n\`\`\`\n${forms}\n\`\`\`${syscalls}`;
}

function snippetFor(name: string): string {
  const def = INSTRUCTION_MAP.get(name);
  const syntax = def?.forms[0]?.syntax;
  if (!syntax) return name;
  const operands = syntax.slice(name.length).trim();
  if (operands === "") return name;
  let n = 0;
  const body = operands
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      n++;
      // keep offset(base) readable as a placeholder
      return `\${${n}:${part.replace(/[${}\\]/g, "")}}`;
    })
    .join(", ");
  return `${name} ${body}`;
}

export function registerMipsLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === MIPS_LANGUAGE_ID)) return;
  monaco.languages.register({ id: MIPS_LANGUAGE_ID, aliases: ["MIPS", "mips"], extensions: [".s", ".asm"] });

  monaco.languages.setLanguageConfiguration(MIPS_LANGUAGE_ID, {
    comments: { lineComment: "#" },
    brackets: [["(", ")"]],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string", "comment"] },
      { open: "'", close: "'", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
    wordPattern: /[$.]?[A-Za-z_][\w$.]*|-?\d+/g,
    onEnterRules: [
      {
        // Indent after a label-only line.
        beforeText: /^\s*[A-Za-z_][\w.$]*:\s*(#.*)?$/,
        action: { indentAction: monaco.languages.IndentAction.Indent },
      },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*[A-Za-z_][\w.$]*:\s*(#.*)?$/,
      decreaseIndentPattern: /^\s*$^/,
    },
  });

  monaco.languages.setMonarchTokensProvider(MIPS_LANGUAGE_ID, {
    ignoreCase: false,
    instructions: [...EDITOR_INSTRUCTION_NAMES],
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/^\s*[A-Za-z_][\w.$]*(?=\s*:)/, "type.identifier"],
        [/:/, "delimiter"],
        [/\.[A-Za-z_]\w*/, "keyword.directive"],
        [/\$[A-Za-z0-9]+/, "variable.predefined"],
        [/0[xX][0-9a-fA-F]+/, "number.hex"],
        [/\d+/, "number"],
        [/"/, { token: "string.quote", next: "@string" }],
        [/'(?:\\.|[^\\'])'/, "string.char"],
        [
          /[A-Za-z_][\w.$]*/,
          { cases: { "@instructions": "keyword", "@default": "identifier" } },
        ],
        [/[(),+-]/, "delimiter"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string.quote", next: "@pop" }],
      ],
    },
  } as Monaco.languages.IMonarchLanguage);

  monaco.editor.defineTheme(MIPS_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "569CD6" },
      { token: "keyword.directive", foreground: "C586C0" },
      { token: "variable.predefined", foreground: "9CDCFE" },
      { token: "type.identifier", foreground: "DCDCAA" },
      { token: "number", foreground: "B5CEA8" },
      { token: "number.hex", foreground: "B5CEA8" },
      { token: "string", foreground: "CE9178" },
      { token: "string.char", foreground: "CE9178" },
      { token: "string.escape", foreground: "D7BA7D" },
      { token: "comment", foreground: "6A9955" },
    ],
    colors: {
      "editor.background": "#1e1e1e",
      "editor.lineHighlightBackground": "#2a2d2e",
    },
  });

  const range = (model: Monaco.editor.ITextModel, position: Monaco.Position): Monaco.IRange => {
    const word = model.getWordUntilPosition(position);
    return {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
  };

  monaco.languages.registerCompletionItemProvider(MIPS_LANGUAGE_ID, {
    triggerCharacters: ["$", "."],
    provideCompletionItems(model, position) {
      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const wordRange = range(model, position);
      const Kind = monaco.languages.CompletionItemKind;
      const Rule = monaco.languages.CompletionItemInsertTextRule;
      const suggestions: Monaco.languages.CompletionItem[] = [];

      const wantsRegister = /\$\w*$/.test(linePrefix);
      const wantsDirective = /(^|\s)\.\w*$/.test(linePrefix);
      const startOfStatement = /^\s*([A-Za-z_][\w.$]*\s*:\s*)*[A-Za-z_]*$/.test(linePrefix);

      if (wantsRegister) {
        REGISTER_NAMES.forEach((name, index) => {
          suggestions.push({
            label: `$${name}`,
            kind: Kind.Variable,
            insertText: `$${name}`,
            detail: `register ${index}`,
            range: wordRange,
          });
        });
        return { suggestions };
      }
      if (wantsDirective) {
        for (const d of DIRECTIVES) {
          suggestions.push({
            label: d.name,
            kind: Kind.Keyword,
            insertText: d.name,
            detail: d.syntax,
            documentation: d.summary,
            range: wordRange,
          });
        }
        return { suggestions };
      }
      if (startOfStatement) {
        for (const name of EDITOR_INSTRUCTION_NAMES) {
          const def = INSTRUCTION_MAP.get(name)!;
          suggestions.push({
            label: name,
            kind: Kind.Function,
            insertText: snippetFor(name),
            insertTextRules: Rule.InsertAsSnippet,
            detail: def.forms.map((f) => f.syntax).join("  |  "),
            documentation: { value: instructionDoc(name) ?? def.summary },
            range: wordRange,
          });
        }
      }
      // Labels declared in this document.
      const text = model.getValue();
      const seen = new Set<string>();
      for (const match of text.matchAll(LABEL_PATTERN)) {
        const label = match[1]!;
        if (seen.has(label)) continue;
        seen.add(label);
        suggestions.push({
          label,
          kind: Kind.Reference,
          insertText: label,
          detail: "label",
          range: wordRange,
        });
      }
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider(MIPS_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const text = word.word;
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const doc = instructionDoc(text.toLowerCase());
      if (doc) return { range, contents: [{ value: doc }] };
      const directive = DIRECTIVES.find((d) => d.name === text);
      if (directive) {
        return { range, contents: [{ value: `**${directive.name}**\n\n${directive.summary}\n\n\`${directive.syntax}\`` }] };
      }
      if (text.startsWith("$")) {
        const idx = REGISTER_NAMES.indexOf(text.slice(1) as (typeof REGISTER_NAMES)[number]);
        if (idx >= 0) return { range, contents: [{ value: `**${text}** — register ${idx}` }] };
      }
      return null;
    },
  });
}
