import type { SnippetProblem } from "../problems/snippets";
interface Request {
  problem: SnippetProblem;
  source: string;
  revision: number;
}
export interface Reply {
  id: string;
  revision: number;
  passed: boolean;
  message: string;
}
/** One active execution and one newest pending edit; a watchdog replaces stuck workers. */
export class Grader {
  private worker: Worker;
  private busy = false;
  private pending: Request | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  constructor(private receive: (reply: Reply) => void) {
    this.worker = this.spawn();
  }
  private spawn() {
    const w = new Worker(new URL("./check.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (e) => {
      if (this.timeout) clearTimeout(this.timeout);
      this.busy = false;
      this.receive(e.data);
      const next = this.pending;
      this.pending = null;
      if (next) this.submit(next);
    };
    w.onerror = () => this.restart();
    return w;
  }
  private restart() {
    this.worker.terminate();
    if (this.timeout) clearTimeout(this.timeout);
    this.busy = false;
    this.worker = this.spawn();
    const next = this.pending;
    this.pending = null;
    if (next) this.submit(next);
  }
  submit(req: Request) {
    if (this.busy) {
      this.pending = req;
      return;
    }
    this.busy = true;
    this.timeout = setTimeout(() => {
      this.receive({
        id: req.problem.id,
        revision: req.revision,
        passed: false,
        message: "Execution timed out. Edit your code to retry.",
      });
      this.restart();
    }, 1500);
    this.worker.postMessage(req);
  }
  dispose() {
    if (this.timeout) clearTimeout(this.timeout);
    this.worker.terminate();
  }
}
