import { LIMITS } from "../mips/limits";
import type { Machine } from "../mips/machine";

/** Yield to the worker's event loop so queued messages (cancellation) are delivered. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== "undefined") {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Run a machine in chunks of about 1,024 instructions, yielding between chunks.
 * Resolves "cancelled" as soon as `isCancelled()` reports true.
 */
export async function runCooperatively(
  machine: Machine,
  isCancelled: () => boolean,
  chunkSize: number = LIMITS.chunkSize,
): Promise<"finished" | "cancelled"> {
  while (machine.status === "running") {
    machine.runChunk(chunkSize);
    if (machine.status !== "running") break;
    await yieldToEventLoop();
    if (isCancelled()) return "cancelled";
  }
  return "finished";
}
