export const REGISTER_NAMES = [
  "zero",
  "at",
  "v0",
  "v1",
  "a0",
  "a1",
  "a2",
  "a3",
  "t0",
  "t1",
  "t2",
  "t3",
  "t4",
  "t5",
  "t6",
  "t7",
  "s0",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "t8",
  "t9",
  "k0",
  "k1",
  "gp",
  "sp",
  "fp",
  "ra",
] as const;

export const REG = {
  zero: 0,
  at: 1,
  v0: 2,
  v1: 3,
  a0: 4,
  a1: 5,
  a2: 6,
  a3: 7,
  sp: 29,
  ra: 31,
} as const;

const NAME_TO_NUMBER = new Map<string, number>();
REGISTER_NAMES.forEach((name, i) => NAME_TO_NUMBER.set(name, i));
NAME_TO_NUMBER.set("s8", 30);

/** Resolve text such as `$t0`, `$8`, or `$fp` to a register number, or null. */
export function parseRegister(text: string): number | null {
  const body = text.startsWith("$") ? text.slice(1) : text;
  if (/^[0-9]+$/.test(body)) {
    const n = Number(body);
    return n >= 0 && n <= 31 ? n : null;
  }
  const named = NAME_TO_NUMBER.get(body.toLowerCase());
  return named ?? null;
}

export function registerName(index: number): string {
  return `$${REGISTER_NAMES[index] ?? index}`;
}
