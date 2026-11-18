import { gradeFragment } from "./grade";
import type { EasyProblem } from "../problems/easy/types";
self.onmessage = (
  e: MessageEvent<{ problem: EasyProblem; source: string; revision: number }>,
) => {
  const { problem, source, revision } = e.data;
  try {
    self.postMessage({
      id: problem.id,
      revision,
      ...gradeFragment(problem, source),
    });
  } catch {
    self.postMessage({
      id: problem.id,
      revision,
      passed: false,
      message: "Unable to execute this fragment.",
    });
  }
};
