import { renderDiagrams } from "./diagrams";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
declare global {
  interface Window {
    folioReady: Promise<string[]>;
    folioPdfPages: (data: string, scale: number) => Promise<string[]>;
  }
}
window.folioReady = (async () => {
  const errors = await renderDiagrams(document.querySelector(".document")!);
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map(async (img) => {
      try {
        await img.decode();
      } catch {
        errors.push(`Image failed to decode: ${img.alt}`);
      }
    }),
  );
  return errors;
})();
window.folioPdfPages = async (data, scale) => {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const task = pdfjs.getDocument({ data: bytes });
  const pdf = await task.promise;
  if (pdf.numPages > 200)
    throw new Error(
      "More than 200 pages. Split the document before exporting images.",
    );
  const images: string[] = [];
  let encodedSize = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    if (viewport.width * viewport.height > 32000000)
      throw new Error("Page exceeds the image pixel limit. Reduce scale.");
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const encoded = canvas.toDataURL("image/png").split(",")[1];
    encodedSize += encoded.length;
    if (encodedSize > 85 * 1024 * 1024)
      throw new Error(
        "Page images exceed the 64 MiB artifact limit. Split the document.",
      );
    images.push(encoded);
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
  await task.destroy();
  return images;
};
