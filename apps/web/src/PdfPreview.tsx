import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export function PdfPreview({ blob }: { blob: Blob }) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let task: ReturnType<typeof pdfjs.getDocument> | undefined;
    void (async () => {
      try {
        const data = new Uint8Array(await blob.arrayBuffer());
        if (stopped) return;
        task = pdfjs.getDocument({ data });
        const pdf = await task.promise;
        root.current?.replaceChildren();
        for (let i = 1; i <= pdf.numPages; i++) {
          if (stopped) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.setAttribute("aria-label", `PDF page ${i}`);
          canvas.setAttribute("role", "img");
          root.current?.append(canvas);
          await page.render({ canvas, viewport }).promise;
        }
      } catch (e) {
        if (!stopped) setError(String(e));
      }
    })();
    return () => {
      stopped = true;
      void task?.destroy();
    };
  }, [blob]);
  return (
    <>
      <p className="help">
        Actual exported PDF · visual page preview. Text remains searchable and
        selectable, and continued tables repeat their header rows.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="pdf-pages" ref={root} />
    </>
  );
}
