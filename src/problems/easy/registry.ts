import { translationFamilies } from "./translation";
import { tracingFamilies } from "./tracing";
export { translationFamilies, tracingFamilies };
export const CATEGORIES = [
  "c_snippet_to_mips_legacy",
  "c_snippet_to_mips_normal",
  "c_snippet_to_mips_easy",
  "mips_snippet_behavior_tracing_easy",
] as const;
export function generateProblem(index: number) {
  const list = index % 2 === 0 ? translationFamilies : tracingFamilies;
  const bytes = crypto.getRandomValues(new Uint32Array(3));
  const p = list[bytes[0] % list.length].generate(
    (bytes[1] % 19) + 1,
    (bytes[2] % 19) + 1,
  );
  p.id = crypto.randomUUID();
  return p;
}
