import { base, type Family } from "../snippets";
const setTwoIntsPerformOp: Family = {
  id: "set_two_ints_perform_op",
  generate(a, b) {
    const p = base("set_two_ints_perform_op", a, b);
    const outer = ["-", "+", "*"][b % 3];
    const inner = ["*", "+", "-"][(a + b) % 3];
    const op = (x: number, y: number, operator: string) =>
      operator === "+" ? x + y : operator === "-" ? x - y : x * y;
    const mnemonic: Record<string, string> = {
      "+": "add",
      "-": "sub",
      "*": "mul",
    };
    p.cTarget = `    a = ${a};\n    b = ${b};\n    a = b ${outer} (a ${inner} 3);`;
    p.reference = `li $t0, ${a}\nli $t1, ${b}\nli $t2, 3\n${mnemonic[inner]} $t0, $t0, $t2\n${mnemonic[outer]} $t0, $t1, $t0`;
    p.answer = op(b, op(a, 3, inner), outer);
    p.expectedOutput = String(p.answer);
    return p;
  },
};
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
  setTwoIntsPerformOp,
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
  {
    id: "read_one_int",
    generate(a, b) {
      const p = base("read_one_int", a, b);
      p.cTarget = '    scanf("%d", &a);';
      p.reference = "li $v0, 5\nsyscall\nmove $t0, $v0";
      p.cases = [0, 1, -7, 19].map((x) => ({
        stdin: String(x),
        answer: x,
        output: String(x),
      }));
      p.answer = a;
      p.expectedOutput = String(a);
      return p;
    },
  },
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
