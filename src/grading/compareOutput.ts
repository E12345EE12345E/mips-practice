/** Exact byte comparison. Never trims, normalizes newlines, or ignores case. */
export function compareOutput(expected: Uint8Array, actual: Uint8Array): boolean {
  if (expected.length !== actual.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) return false;
  }
  return true;
}
