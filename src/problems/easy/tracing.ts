import { base, type Family } from "../snippets";
const scalar = (
  id: string,
  code: (a: number, b: number) => string,
  answer: (a: number, b: number) => number,
  input = false,
): Family => ({
  id,
  generate(a, b) {
    const p = base(id, a, b);
    p.category = "mips_snippet_behavior_tracing_easy";
    p.data = `.data\nmy_num: .word ${b}`;
    p.snippet = code(a, b);
    p.answer = answer(a, b);
    p.label = "$t2";
    p.register = 10;
    p.stdin = input ? String(a) : "";
    return p;
  },
});
export const tracingFamilies: Family[] = [
  scalar(
    "set_two_regs_perform_one_op",
    (a, b) => `li $t0, ${a}\nli $t1, ${b}\nadd $t2, $t0, $t1`,
    (a, b) => a + b,
  ),
  scalar(
    "read_one_int_perform_one_op",
    (_a, b) => `li $v0, 5\nsyscall\nmove $t0, $v0\nsub $t2, $t0, ${b}`,
    (a, b) => a - b,
    true,
  ),
  scalar(
    "read_one_int_perform_two_ops",
    (_a, b) =>
      `li $v0, 5\nsyscall\nmove $t0, $v0\nadd $t2, $t0, ${b}\nsub $t2, $t2, 3`,
    (a, b) => a + b - 3,
    true,
  ),
  scalar(
    "copy_reg_then_update_original",
    (a) => `li $t0, ${a}\nmove $t2, $t0\naddi $t0, $t0, 5`,
    (a) => a,
  ),
  scalar(
    "write_zero_register",
    (a) => `li $zero, 9\naddi $t2, $zero, ${a}`,
    (a) => a,
  ),
  scalar(
    "apply_one_bitmask",
    (a, b) => `li $t0, ${a}\nandi $t2, $t0, ${b}`,
    (a, b) => a & b,
  ),
  scalar(
    "shift_left_once",
    (a) => `li $t0, ${a}\nsll $t2, $t0, 2`,
    (a) => a << 2,
  ),
  scalar(
    "shift_right_logical_once",
    (a) => `li $t0, ${a}\nsrl $t2, $t0, 2`,
    (a) => a >>> 2,
  ),
  scalar(
    "shift_right_arithmetic_once",
    (a) => `li $t0, -${a}\nsra $t2, $t0, 2`,
    (a) => -a >> 2,
  ),
  scalar(
    "compare_signed_less_than",
    (a, b) => `li $t0, ${a}\nli $t1, ${b}\nslt $t2, $t0, $t1`,
    (a, b) => +(a < b),
  ),
  scalar(
    "branch_equal_select_value",
    (a, b) =>
      `li $t0, ${a}\nli $t1, ${b}\nli $t2, 0\nbne $t0, $t1, done\nli $t2, 1\ndone:`,
    (a, b) => +(a === b),
  ),
  scalar(
    "load_word_constant_offset",
    () => "la $t0, my_num\nlw $t2, 0($t0)",
    (_a, b) => b,
  ),
  scalar(
    "multiply_read_lo",
    (a, b) => `li $t0, ${a}\nli $t1, ${b}\nmult $t0, $t1\nmflo $t2`,
    (a, b) => a * b,
  ),
  scalar(
    "stack_save_restore_one_reg",
    (a) =>
      `li $t2, ${a}\naddiu $sp, $sp, -4\nsw $t2, 0($sp)\nli $t2, 0\nlw $t2, 0($sp)\naddiu $sp, $sp, 4`,
    (a) => a,
  ),
  ...[
    "read_string_fits_buffer",
    "read_string_truncates_buffer",
    "store_newline_in_array",
    "insert_null_terminator",
  ].map((id): Family => ({
    id,
    generate(a, b) {
      const p = base(id, a, b);
      p.category = "mips_snippet_behavior_tracing_easy";
      p.label = "buffer[8]";
      p.data = ".data\nbuffer: .byte 97, 98, 99, 0, 0, 0, 0, 0";
      p.answer = [97, 98, 99, 0, 0, 0, 0, 0];
      if (id.startsWith("read_string")) {
        p.data = ".data\nbuffer: .space 8";
        p.stdin = id.includes("truncates") ? "abcdefghij" : "cat";
        p.snippet = "la $a0, buffer\nli $a1, 8\nli $v0, 8\nsyscall";
        p.answer = Array.from({ length: 8 }, (_, i) =>
          i < Math.min(p.stdin.length, 7) ? p.stdin.charCodeAt(i) : 0,
        );
      } else {
        const v = id === "store_newline_in_array" ? 10 : 0;
        p.snippet = `la $t0, buffer\nli $t1, ${v}\nsb $t1, 1($t0)`;
        p.answer[1] = v;
      }
      return p;
    },
  })),
];
tracingFamilies.push(
  scalar(
    "divide_read_quotient",
    (a, b) => `li $t0, ${a}\nli $t1, ${b}\ndiv $t0, $t1\nmflo $t2`,
    (a, b) => Math.trunc(a / b),
  ),
  scalar(
    "divide_read_remainder",
    (a, b) => `li $t0, ${a}\nli $t1, ${b}\ndiv $t0, $t1\nmfhi $t2`,
    (a, b) => a % b,
  ),
  scalar(
    "compare_unsigned_less_than",
    (a, b) => `li $t0, -${a}\nli $t1, ${b}\nsltu $t2, $t0, $t1`,
    () => 0,
  ),
  scalar(
    "branch_less_than_select_value",
    (a, b) =>
      `li $t0, ${a}\nli $t1, ${b}\nli $t2, 0\nbge $t0, $t1, done\nli $t2, 1\ndone:`,
    (a, b) => +(a < b),
  ),
  scalar(
    "countdown_accumulate",
    (a) =>
      `li $t0, ${a % 5}\nli $t2, 0\nloop:\nbeqz $t0, done\nadd $t2, $t2, $t0\naddi $t0, $t0, -1\nb loop\ndone:`,
    (a) => ((a % 5) * ((a % 5) + 1)) / 2,
  ),
  ...[
    "load_signed_byte",
    "load_unsigned_byte",
    "advance_char_pointer_load",
    "store_one_char_in_array",
    "store_word_constant_offset",
    "read_two_ints_perform_one_op",
    "call_leaf_return_value",
  ].map((id): Family => ({
    id,
    generate(a, b) {
      const p = base(id, a, b);
      p.category = "mips_snippet_behavior_tracing_easy";
      p.label = "$t2";
      p.register = 10;
      if (id === "read_two_ints_perform_one_op") {
        p.stdin = `${a} ${b}`;
        p.snippet =
          "li $v0, 5\nsyscall\nmove $t0, $v0\nli $v0, 5\nsyscall\nadd $t2, $t0, $v0";
        p.answer = a + b;
      } else if (id === "call_leaf_return_value") {
        p.snippet = `li $a0, ${a}\njal helper\nmove $t2, $v0\nb done\nhelper:\naddi $v0, $a0, ${b}\njr $ra\ndone:`;
        p.answer = a + b;
      } else if (id === "store_word_constant_offset") {
        p.data = ".data\nvalues: .word 1, 2, 3";
        p.snippet = `li $t0, ${a}\nsw $t0, values+4`;
        p.label = "values[1]";
        p.answer = a;
      } else if (id === "store_one_char_in_array") {
        p.data = ".data\nbuffer: .byte 97, 98, 99, 0";
        p.snippet = `la $t0, buffer\nli $t1, ${65 + a}\nsb $t1, 1($t0)`;
        p.label = "buffer[4]";
        p.answer = [97, 65 + a, 99, 0];
      } else if (id === "advance_char_pointer_load") {
        p.data = '.data\ntext: .asciiz "abcd"';
        p.snippet = `la $t0, text\naddi $t0, $t0, ${a % 4}\nlbu $t2, 0($t0)`;
        p.answer = 97 + (a % 4);
      } else {
        p.data = `.data\nbyte_value: .byte ${128 + a}`;
        p.snippet = `${id === "load_signed_byte" ? "lb" : "lbu"} $t2, byte_value`;
        p.answer = id === "load_signed_byte" ? a - 128 : a + 128;
      }
      return p;
    },
  })),
);

// Each input arithmetic family has a fixed number of operations. Operand syntax
// may vary without changing the educational task.
for (const family of tracingFamilies.filter(
  (f) =>
    f.id === "read_one_int_perform_one_op" ||
    f.id === "read_one_int_perform_two_ops",
)) {
  family.generate = (a, b) => {
    const p = base(family.id, a, b);
    p.category = "mips_snippet_behavior_tracing_easy";
    p.label = "$t2";
    p.register = 10;
    p.stdin = String(a);
    const op = ["add", "sub", "mul"][b % 3];
    const first = op === "add" ? a + b : op === "sub" ? a - b : a * b;
    const useRegister = op === "mul" || a % 2 === 0;
    p.snippet =
      "li $v0, 5\nsyscall\nmove $t0, $v0\n" +
      (useRegister ? `li $t1, ${b}\n` : "") +
      `${op} $t2, $t0, ${useRegister ? "$t1" : b}`;
    p.answer = first;
    if (family.id === "read_one_int_perform_two_ops") {
      p.snippet += "\naddi $t2, $t2, 3";
      p.answer += 3;
    }
    return p;
  };
}
