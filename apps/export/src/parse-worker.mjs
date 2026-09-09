import { parentPort, workerData } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";
try {
  const { renderDocument } = await tsImport(
    "../../../packages/engine/src/index.ts",
    import.meta.url,
  );
  parentPort.postMessage({ result: await renderDocument(workerData) });
} catch (error) {
  parentPort.postMessage({ error: String(error) });
}
