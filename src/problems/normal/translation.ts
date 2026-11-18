import { base as snippetBase, type Family } from "../snippets";

const base: typeof snippetBase = (family, a, b) => ({
  ...snippetBase(family, a, b),
  category: "c_snippet_to_mips_normal",
});

const arithmetic = (id: string, three: boolean): Family => ({
  id,
  generate(a, b) {
    const p = base(id, a, b);
    const k = 3;
    const outer = ["-", "+", "*"][b % 3];
    const inner = ["*", "+", "-"][(a + b) % 3];
    const op = (x: number, y: number, o: string) =>
      o === "+" ? x + y : o === "-" ? x - y : x * y;
    const mnemonic: Record<string, string> = {
      "+": "add",
      "-": "sub",
      "*": "mul",
    };
    p.cTarget = `    a = ${a};\n    b = ${b};\n${three ? "    int c = 3;\n" : ""}    a = b ${outer} (a ${inner} ${three ? "c" : k});`;
    p.reference = `li $t0, ${a}\nli $t1, ${b}\nli $t2, 3\n${mnemonic[inner]} $t0, $t0, $t2\n${mnemonic[outer]} $t0, $t1, $t0`;
    p.answer = op(b, op(a, k, inner), outer);
    p.expectedOutput = String(p.answer);
    return p;
  },
});

/** Longer translation exercises, reserved for future modes. */
export const normalTranslationFamilies: Family[] = [
  arithmetic("set_two_ints_perform_op", false),
  arithmetic("set_three_ints_perform_op", true),
  {
    id: "counted_sum_loop",
    generate(a, b) {
      const p = base("counted_sum_loop", a, b);
      p.cBefore = `int main() {\n    int a = ${a}, b = ${b};`;
      p.prefix += `\nli $t0, ${a}\nli $t1, ${b}`;
      p.cTarget = "    a = 0;\n    for (int i = 0; i < 4; i++) a += i;";
      p.reference = "li $t0, 0\nli $t2, 0\nloop:\nadd $t0, $t0, $t2\naddi $t2, $t2, 1\nblt $t2, 4, loop";
      p.answer = 6;
      p.expectedOutput = "6";
      return p;
    },
  },
  {
    id: "read_two_ints",
    generate(a, b) {
      const p = base("read_two_ints", a, b);
      p.cTarget = '    scanf("%d %d", &a, &b);\n    a += b;';
      p.reference = "li $v0, 5\nsyscall\nmove $t0, $v0\nli $v0, 5\nsyscall\nmove $t1, $v0\nadd $t0, $t0, $t1";
      p.cases = [0, 1, -7, 19].map((x) => ({
        stdin: `${x} ${b}`,
        answer: x + b,
        output: String(x + b),
      }));
      p.answer = a + b;
      p.expectedOutput = String(p.answer);
      return p;
    },
  },
  {
    id: "read_bounded_string",
    generate(a, b) {
      const p = base("read_bounded_string", a, b);
      p.data = ".data\ntext: .space 8";
      p.cBefore = "int main() {\n    char text[8] = {0};";
      p.cTarget = '    scanf("%7s", text);';
      p.cAfter = '    printf("%s", text);\n    return 0;\n}';
      p.label = "text → label text · capacity 8 bytes";
      p.reference = "la $a0, text\nli $a1, 8\nli $v0, 8\nsyscall";
      p.suffix = "la $a0, text\nli $v0, 4\nsyscall\nli $v0, 10\nsyscall";
      p.register = 0;
      p.answer = 0;
      p.cases = ["a", "cat", "abcdefg", "abcdefghijk"].map((stdin) => ({
        stdin,
        answer: 0,
        output: stdin.slice(0, 7),
      }));
      return p;
    },
  },
];
