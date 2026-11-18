import { base, type Family } from "./types";
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
const simple = (
  id: string,
  c: (a: number, b: number) => string,
  asm: (a: number, b: number) => string,
  oracle: (a: number, b: number) => number,
): Family => ({
  id,
  generate(a, b) {
    const p = base(id, a, b);
    p.cBefore = `int main() {\n    int a = ${a}, b = ${b};`;
    p.prefix += `\nli $t0, ${a}\nli $t1, ${b}`;
    p.cTarget = "    " + c(a, b);
    p.reference = asm(a, b);
    p.answer = oracle(a, b);
    if (id === "swap_two_ints") p.checks = { 9: a };
    p.expectedOutput = String(p.answer);
    return p;
  },
});
export const translationFamilies: Family[] = [
  arithmetic("set_two_ints_perform_op", false),
  arithmetic("set_three_ints_perform_op", true),
  simple(
    "set_one_int",
    (_a, b) => `a = ${b};`,
    (_a, b) => `li $t0, ${b}`,
    (_a, b) => b,
  ),
  simple(
    "update_one_int",
    () => "a = a + b;",
    () => "add $t0, $t0, $t1",
    (a, b) => a + b,
  ),
  simple(
    "apply_one_bitmask",
    () => "a = a & b;",
    () => "and $t0, $t0, $t1",
    (a, b) => a & b,
  ),
  simple(
    "shift_left_one_int",
    () => "a = a << 2;",
    () => "sll $t0, $t0, 2",
    (a) => a << 2,
  ),
  simple(
    "shift_right_unsigned_int",
    () => "a = a >> 2;",
    () => "srl $t0, $t0, 2",
    (a) => a >>> 2,
  ),
  simple(
    "compare_two_ints_less_than",
    () => "a = a < b;",
    () => "slt $t0, $t0, $t1",
    (a, b) => +(a < b),
  ),
  simple(
    "conditional_assign_one_int",
    () => "if (a < b) a = 9;",
    () => "bge $t0, $t1, done\nli $t0, 9\ndone:",
    (a, b) => (a < b ? 9 : a),
  ),
  simple(
    "if_else_select_int",
    () => "if (a >= b) a = b;",
    () => "blt $t0, $t1, done\nmove $t0, $t1\ndone:",
    Math.min,
  ),
  simple(
    "counted_sum_loop",
    () => "a = 0;\n    for (int i = 0; i < 4; i++) a += i;",
    () =>
      "li $t0, 0\nli $t2, 0\nloop:\nadd $t0, $t0, $t2\naddi $t2, $t2, 1\nblt $t2, 4, loop",
    () => 6,
  ),
  simple(
    "swap_two_ints",
    () => "int tmp = a;\n    a = b;\n    b = tmp;",
    () => "move $t2, $t0\nmove $t0, $t1\nmove $t1, $t2",
    (_a, b) => b,
  ),
];
translationFamilies.push(
  simple(
    "divide_two_ints_quotient",
    () => "a = a / b;",
    () => "div $t0, $t1\nmflo $t0",
    (a, b) => Math.trunc(a / b),
  ),
  simple(
    "divide_two_ints_remainder",
    () => "a = a % b;",
    () => "div $t0, $t1\nmfhi $t0",
    (a, b) => a % b,
  ),
  ...["read_one_int", "read_two_ints"].map((id): Family => ({
    id,
    generate(a, b) {
      const p = base(id, a, b);
      const two = id === "read_two_ints";
      p.cTarget = two
        ? '    scanf("%d %d", &a, &b);\n    a += b;'
        : '    scanf("%d", &a);';
      p.reference =
        "li $v0, 5\nsyscall\nmove $t0, $v0" +
        (two ? "\nli $v0, 5\nsyscall\nmove $t1, $v0\nadd $t0, $t0, $t1" : "");
      p.cases = [0, 1, -7, 19].map((x) => ({
        stdin: two ? `${x} ${b}` : String(x),
        answer: two ? x + b : x,
        output: String(two ? x + b : x),
      }));
      p.answer = two ? a + b : a;
      p.expectedOutput = String(p.answer);
      return p;
    },
  })),
  ...["print_one_int", "print_one_char", "print_one_string"].map(
    (id): Family => ({
      id,
      generate(a, b) {
        const p = base(id, a, b);
        const str = id.endsWith("string"),
          char = id.endsWith("char");
        p.data = '.data\ntext: .asciiz "hello"';
        p.cBefore = str
          ? 'int main() {\n    char text[] = "hello";'
          : `int main() {\n    int a = ${char ? 65 : a};`;
        p.prefix += `\nli $t0, ${char ? 65 : a}`;
        p.cTarget = str
          ? '    printf("%s", text);'
          : char
            ? '    printf("%c", a);'
            : '    printf("%d", a);';
        p.cAfter = "    return 0;\n}";
        p.suffix = "li $v0, 10\nsyscall";
        p.reference =
          (str ? "la $a0, text" : "move $a0, $t0") +
          `\nli $v0, ${str ? 4 : char ? 11 : 1}\nsyscall`;
        p.answer = char ? 65 : a;
        p.expectedOutput = str ? "hello" : char ? "A" : String(a);
        return p;
      },
    }),
  ),
  ...[
    "load_word_constant_index",
    "store_word_constant_index",
    "load_char_constant_index",
    "store_char_constant_index",
  ].map((id): Family => ({
    id,
    generate(a, b) {
      const p = base(id, a, b);
      const char = id.includes("char"),
        store = id.startsWith("store");
      p.data = char
        ? ".data\ntext: .byte 97, 98, 99, 0"
        : `.data\nvalues: .word ${a}, ${b}, 3, 4`;
      p.cBefore = char
        ? 'int main() {\n    char text[] = "abc";\n    int a = 90;'
        : `int main() {\n    int values[] = {${a}, ${b}, 3, 4};\n    int a = ${a};`;
      p.prefix += `\nli $t0, ${char ? 90 : a}`;
      p.cTarget = store
        ? `    ${char ? "text" : "values"}[1] = a;`
        : `    a = ${char ? "text" : "values"}[1];`;
      p.reference = `la $t2, ${char ? "text" : "values"}\n${store ? (char ? "sb" : "sw") : char ? "lbu" : "lw"} $t0, ${char ? 1 : 4}($t2)`;
      p.answer = store ? (char ? 90 : a) : char ? 98 : b;
      p.expectedOutput = String(p.answer);
      if (store)
        p.memory = {
          label: char ? "text" : "values",
          bytes: char
            ? [97, 90, 99, 0]
            : [a, 0, 0, 0, a, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
        };
      return p;
    },
  })),
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
  {
    id: "call_leaf_one_arg",
    generate(a, b) {
      const p = base("call_leaf_one_arg", a, b);
      p.cBefore = `int add_k(int x) { return x + ${b}; }\nint main() {\n    int a = ${a};`;
      p.prefix = `.text\nadd_k:\naddi $v0, $a0, ${b}\njr $ra\nmain:\nli $t0, ${a}`;
      p.cTarget = "    a = add_k(a);";
      p.reference = "move $a0, $t0\njal add_k\nmove $t0, $v0";
      p.answer = a + b;
      p.expectedOutput = String(a + b);
      return p;
    },
  },
);
