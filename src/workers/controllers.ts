import { LIMITS } from "../mips/limits";
import type {
  GradeRequest,
  GradeResponse,
  GraderWorkerOut,
  InitProblemRequest,
  PreviewRequest,
  PreviewResponse,
  PreviewWorkerOut,
} from "./protocol";

export class WorkerTimeoutError extends Error {
  constructor(message = "The worker did not respond in time and was restarted") {
    super(message);
    this.name = "WorkerTimeoutError";
  }
}

interface Pending<Res> {
  resolve(value: Res): void;
  reject(reason: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Owns one worker. Every request carries a revision id; a wall-clock watchdog
 * terminates and replaces a stuck worker (distinct from the deterministic
 * instruction limit enforced inside the engine).
 */
export class WorkerClient<Req extends { requestId: number }, Res extends { requestId: number }> {
  private worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending<Res>>();
  private disposed = false;

  constructor(
    private readonly factory: () => Worker,
    private readonly watchdogMs: number = LIMITS.workerWatchdogMs,
  ) {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const worker = this.factory();
    worker.onmessage = (event: MessageEvent<Res>) => {
      const entry = this.pending.get(event.data.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(event.data.requestId);
      entry.resolve(event.data);
    };
    worker.onerror = () => {
      this.replace(new Error("The worker crashed and was restarted"));
    };
    return worker;
  }

  private replace(reason: unknown): void {
    this.worker.terminate();
    const stale = [...this.pending.values()];
    this.pending.clear();
    for (const entry of stale) {
      clearTimeout(entry.timer);
      entry.reject(reason);
    }
    if (!this.disposed) this.worker = this.spawn();
  }

  /** Send a request; resolves with the matching response. */
  request(message: Omit<Req, "requestId">): Promise<Res> {
    if (this.disposed) return Promise.reject(new Error("Worker client disposed"));
    const requestId = this.nextId++;
    return new Promise<Res>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(requestId)) this.replace(new WorkerTimeoutError());
      }, this.watchdogMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({ ...message, requestId });
    });
  }

  /** Fire-and-forget message that has no response. */
  post(message: unknown): void {
    if (!this.disposed) this.worker.postMessage(message);
  }

  dispose(): void {
    this.disposed = true;
    this.replace(new Error("Worker client disposed"));
  }
}

export function createPreviewClient(): WorkerClient<PreviewRequest, PreviewResponse & PreviewWorkerOut> {
  return new WorkerClient(
    () => new Worker(new URL("./preview.worker.ts", import.meta.url), { type: "module", name: "preview" }),
  );
}

export interface GraderClient {
  grade(req: Omit<GradeRequest, "requestId">): Promise<GradeResponse>;
  init(req: InitProblemRequest): void;
  dispose(): void;
}

export function createGraderClient(): GraderClient {
  const client = new WorkerClient<GradeRequest, GradeResponse & GraderWorkerOut>(
    () => new Worker(new URL("./grader.worker.ts", import.meta.url), { type: "module", name: "grader" }),
  );
  return {
    grade: (req) => client.request(req),
    init: (req) => client.post(req),
    dispose: () => client.dispose(),
  };
}
