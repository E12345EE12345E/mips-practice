/**
 * Versioned deterministic PRNG (xoshiro128**, seeded through splitmix32).
 * Bump PRNG_VERSION if the algorithm or derivation ever changes, so stored
 * public problem identities stay reproducible.
 */
export const PRNG_VERSION = 1;

export type Seed = [number, number, number, number];

export interface RandomSource {
  /** Uniform unsigned 32-bit integer. */
  nextU32(): number;
  /** Uniform integer in [min, max], inclusive, without modulo bias. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle; returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Random string over the given alphabet. */
  string(length: number, alphabet: string): string;
}

export const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
export const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function splitmix32(state: number): [number, number] {
  state = (state + 0x9e3779b9) | 0;
  let z = state;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return [state, z >>> 0];
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

/** Fresh seed from the platform CSPRNG. */
export function randomSeed(): Seed {
  const words = new Uint32Array(4);
  globalThis.crypto.getRandomValues(words);
  return [words[0]!, words[1]!, words[2]!, words[3]!];
}

export function createRng(seed: Seed): RandomSource {
  // Expand the seed through splitmix32 so weak seeds (such as all zeros) still work.
  let sm = (seed[0] ^ Math.imul(seed[1], 3) ^ Math.imul(seed[2], 5) ^ Math.imul(seed[3], 7)) | 0;
  const s = new Uint32Array(4);
  for (let i = 0; i < 4; i++) {
    const [next, out] = splitmix32((sm ^ seed[i]!) | 0);
    sm = next;
    s[i] = out;
  }

  const nextU32 = (): number => {
    const result = (Math.imul(rotl(Math.imul(s[1]!, 5) >>> 0, 7), 9) >>> 0) as number;
    const t = (s[1]! << 9) >>> 0;
    s[2] = (s[2]! ^ s[0]!) >>> 0;
    s[3] = (s[3]! ^ s[1]!) >>> 0;
    s[1] = (s[1]! ^ s[2]!) >>> 0;
    s[0] = (s[0]! ^ s[3]!) >>> 0;
    s[2] = (s[2]! ^ t) >>> 0;
    s[3] = rotl(s[3]!, 11);
    return result;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid integer range [${min}, ${max}]`);
    }
    const range = max - min + 1;
    if (range === 1) return min;
    if (range > 0x100000000) throw new RangeError("Range too large");
    // Rejection sampling avoids modulo bias.
    const limit = Math.floor(0x100000000 / range) * range;
    let value = nextU32();
    while (value >= limit) value = nextU32();
    return min + (value % range);
  };

  const rng: RandomSource = {
    nextU32,
    int,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError("Cannot pick from an empty list");
      return items[int(0, items.length - 1)]!;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    string: (length: number, alphabet: string): string => {
      let out = "";
      for (let i = 0; i < length; i++) out += alphabet[int(0, alphabet.length - 1)];
      return out;
    },
  };
  return rng;
}

/** Derive an independent named stream from a root seed. */
export function deriveStream(seed: Seed, label: string): RandomSource {
  const h = fnv1a(`prng-v${PRNG_VERSION}:${label}`);
  const mixed = seed.map((word, i) => splitmix32((word ^ Math.imul(h, 0x9e3779b1 + 2 * i)) | 0)[1]) as Seed;
  return createRng(mixed);
}
