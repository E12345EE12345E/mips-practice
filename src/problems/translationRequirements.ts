/** One executed instruction from the group is enough; no prescribed sequence. */
export const arithmeticInstructions: Record<string, readonly string[]> = {
  "+": ["add", "addi", "addu", "addiu"],
  "-": ["sub", "subu", "add", "addi", "addu", "addiu"],
  "*": ["mul", "mult", "multu", "sll", "sllv"],
};
export const translationRequirements: Record<string, readonly string[]> = {
  update_one_int: arithmeticInstructions["+"],
  apply_one_bitmask: ["and", "andi"],
  shift_left_one_int: ["sll", "sllv", "mul", "mult", "multu"],
  shift_right_unsigned_int: ["srl", "srlv", "sra", "srav", "div"],
  compare_two_ints_less_than: ["slt", "slti", "sltu", "sltiu", "blt", "bge", "bgt", "ble"],
  conditional_assign_one_int: ["slt", "slti", "sltu", "sltiu", "blt", "bge", "bgt", "ble", "beq", "bne", "beqz", "bnez"],
  if_else_select_int: ["slt", "slti", "sltu", "sltiu", "blt", "bge", "bgt", "ble", "beq", "bne", "beqz", "bnez"],
  divide_two_ints_quotient: ["mflo"],
  divide_two_ints_remainder: ["mfhi"],
  load_word_constant_index: ["lw"],
  load_char_constant_index: ["lb", "lbu"],
  store_word_constant_index: ["sw"],
  store_char_constant_index: ["sb"],
  swap_two_ints: ["move", "add", "addu", "or", "xor"],
  call_leaf_one_arg: ["jal", "jalr"],
  counted_sum_loop: arithmeticInstructions["+"],
};
