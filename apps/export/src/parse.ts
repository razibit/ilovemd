import { Worker } from "node:worker_threads";
import type { DocumentSnapshot, RenderResult } from "@folio/engine";
export function parseIsolated(
  snapshot: DocumentSnapshot,
  signal?: AbortSignal,
): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./parse-worker.mjs", import.meta.url), {
      workerData: snapshot,
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new Error("Export cancelled."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Document parsing exceeded 10 seconds. Simplify or split the document.",
        ),
      );
    }, 10000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    worker.on("message", (message) => {
      cleanup();
      if (message.error) reject(new Error(message.error));
      else resolve(message.result);
    });
    worker.on("error", (error) => {
      cleanup();
      reject(error);
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        cleanup();
        reject(
          new Error("Parser stopped because it exceeded a resource limit."),
        );
      }
    });
  });
}
