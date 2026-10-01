import DOMPurify from "dompurify";
import {
  applyLayout,
  verifyGeometry,
  type DocumentLayout,
} from "./document-surface";
import { measuredPdf } from "./measured-pdf";
import { measuredPages } from "./export-geometry";
import html2canvas from "html2canvas";
import { zipSync } from "fflate";
import {
  escapeHtml,
  renderDocument,
  type Diagnostic,
  type DocumentSnapshot,
  type ExportOptions,
} from "@folio/engine";
import {
  overlaySvg,
  validateAnnotations,
  type AnnotationSet,
} from "../../../packages/engine/src/annotations";
import { renderDiagrams } from "./diagrams";

const MAX_PIXELS = 32_000_000;
export class BrowserExportPreflightError extends Error {
  constructor(public diagnostics: Diagnostic[]) {
    super(
      "Export needs attention. Resolve the diagnostics or explicitly export with warnings.",
    );
  }
}

export type BrowserArtifactResult = {
  artifact: { name: string; mime: string; blob: Blob };
  warnings: Diagnostic[];
};

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) {
    if (signal.reason instanceof Error) throw signal.reason;
    throw new DOMException("Export cancelled.", "AbortError");
  }
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The browser could not encode the export image.");
  return blob;
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function waitForResources(root: HTMLElement, signal?: AbortSignal) {
  checkAbort(signal);
  await document.fonts.ready;
  const errors: string[] = [];
  await Promise.all(
    [...root.querySelectorAll("img")].map(async (image) => {
      checkAbort(signal);
      try {
        await image.decode();
      } catch {
        errors.push(`Image failed to decode: ${image.alt || "unnamed image"}`);
      }
    }),
  );
  return errors;
}

let embeddedCss: Promise<string> | undefined;
async function standaloneCss(signal?: AbortSignal) {
  if (embeddedCss) return embeddedCss;
  embeddedCss = (async () => {
    const css = [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules]
            .filter(
              (rule) =>
                rule instanceof CSSFontFaceRule ||
                ((rule.cssText.includes(".document") ||
                  rule.cssText.includes(".katex")) &&
                  !/preview-scroll|preview-surface|mode-split|@media/.test(
                    rule.cssText,
                  )),
            )
            .map((rule) =>
              rule.cssText.replace(
                /url\(["']?([^"')]+)["']?\)/g,
                (original, value: string) => {
                  if (/^(data:|blob:|#)/i.test(value)) return original;
                  // CSS URLs are relative to their stylesheet, not the document.
                  return `url("${new URL(value, sheet.href ?? document.baseURI).href}")`;
                },
              ),
            );
        } catch {
          return [];
        }
      })
      .join("\n");
    const urls = [
      ...new Set(
        [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]),
      ),
    ];
    let inlined = css;
    await Promise.all(
      urls.map(async (value) => {
        if (/^(data:|blob:|#)/i.test(value)) return;
        checkAbort(signal);
        try {
          const response = await fetch(new URL(value, document.baseURI), {
            signal,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          inlined = inlined.split(value).join(data);
        } catch (error) {
          checkAbort(signal);
          throw new Error(
            `HTML font could not be embedded: ${String(error)}. Retry the export after resources load.`,
          );
        }
      }),
    );
    return inlined;
  })().catch((error) => {
    embeddedCss = undefined;
    throw error;
  });
  return embeddedCss;
}

export interface BrowserExportContext {
  documentId: string;
  revision: number;
  html?: string;
  layout: DocumentLayout;
}
function makeSurface(
  html: string,
  options: ExportOptions,
  annotations?: AnnotationSet,
  context?: BrowserExportContext,
) {
  const host = document.createElement("div"),
    article = document.createElement("article");
  let layout =
    context?.layout ??
    (options.includeAnnotations ? annotations?.layout : undefined);
  // Clean document/block PNGs still honor the explicit width control. Annotated
  // captures and page images use their frozen shared PDF/document geometry.
  if (
    layout &&
    options.format === "png" &&
    options.pngMode !== "pages" &&
    !options.includeAnnotations
  )
    layout = { ...layout, width: options.width, height: 0 };
  host.className = "document-surface";
  host.dataset.exportSurface = "true";
  host.style.cssText = `position:fixed;inset:0 auto auto 0;z-index:-2147483647;pointer-events:none;width:${layout?.width ?? options.width}px`;
  article.className = "document";
  article.dataset.theme = options.theme;
  if (layout) applyLayout(article, layout);
  else
    article.style.cssText = `width:${options.width}px;max-width:none;--annotation-columns:${innerWidth <= 650 ? 1 : 2}`;
  article.dataset.annotated = "true";
  if (options.format === "png" && options.background === "transparent")
    article.style.background = "transparent";
  article.innerHTML = DOMPurify.sanitize(html);
  host.append(article);
  if (options.includeAnnotations && annotations)
    host.insertAdjacentHTML("beforeend", overlaySvg(annotations));
  document.body.append(host);
  return { host, article };
}

async function capture(
  target: HTMLElement,
  options: ExportOptions,
  signal?: AbortSignal,
  crop?: { x?: number; y: number; width?: number; height: number },
) {
  checkAbort(signal);
  const width = Math.ceil(crop?.width ?? target.offsetWidth);
  const height = Math.ceil(crop?.height ?? target.offsetHeight);
  if (width * height * options.scale ** 2 > MAX_PIXELS)
    throw new Error(
      "Page exceeds the image pixel limit. Reduce scale or export page images.",
    );
  const canvas = await html2canvas(target, {
    backgroundColor:
      options.background === "transparent"
        ? null
        : options.theme === "dark"
          ? "#202822"
          : "#ffffff",
    scale: options.scale,
    useCORS: false,
    allowTaint: false,
    logging: false,
    x: crop?.x ?? 0,
    y: crop?.y ?? 0,
    width,
    height,
    windowWidth: innerWidth,
    windowHeight: innerHeight,
  });
  checkAbort(signal);
  return canvas;
}

async function pageImages(
  surface: HTMLElement,
  article: HTMLElement,
  options: ExportOptions,
  signal?: AbortSignal,
) {
  const { slices, scale: paperScale, size } = measuredPages(article, options),
    files: Record<string, Uint8Array> = {};
  // PDF coordinates are points; page PNGs use CSS pixels at 96 DPI before
  // applying the requested pixel density. Both share the same paper transform.
  const pointPixels = (96 / 72) * options.scale,
    documentScale = paperScale * pointPixels,
    margin = ((options.margin * 96) / 25.4) * options.scale,
    pageWidth = Math.ceil(((size[0] * 96) / 25.4) * options.scale),
    pageHeight = Math.ceil(((size[1] * 96) / 25.4) * options.scale);
  if (pageWidth * pageHeight > MAX_PIXELS)
    throw new Error(
      "Page exceeds the image pixel limit. Reduce scale before exporting.",
    );
  for (const [index, slice] of slices.entries()) {
    checkAbort(signal);
    const canvas = await capture(
      surface,
      { ...options, scale: documentScale },
      signal,
      slice,
    );
    const page = document.createElement("canvas");
    let header: HTMLCanvasElement | undefined;
    try {
      page.width = pageWidth;
      page.height = pageHeight;
      const ctx = page.getContext("2d")!;
      if (options.background !== "transparent") {
        ctx.fillStyle = options.theme === "dark" ? "#202822" : "#ffffff";
        ctx.fillRect(0, 0, page.width, page.height);
      }
      if (slice.header) {
        header = await capture(
          surface,
          { ...options, scale: documentScale },
          signal,
          {
            y: slice.header.y,
            height: slice.header.height,
          },
        );
        ctx.drawImage(header, margin, margin);
      }
      ctx.drawImage(
        canvas,
        margin,
        margin + (slice.header?.height ?? 0) * documentScale,
      );
      files[`page-${String(index + 1).padStart(3, "0")}.png`] = new Uint8Array(
        await (await canvasBlob(page)).arrayBuffer(),
      );
    } finally {
      canvas.width = canvas.height = page.width = page.height = 0;
      if (header) header.width = header.height = 0;
    }
  }
  return files;
}

export async function createBrowserArtifact(
  snapshot: DocumentSnapshot,
  options: ExportOptions,
  signal?: AbortSignal,
  annotations?: AnnotationSet,
  context?: BrowserExportContext,
): Promise<BrowserArtifactResult> {
  snapshot = structuredClone(snapshot);
  options = structuredClone(options);
  annotations = annotations ? structuredClone(annotations) : undefined;
  context = context ? structuredClone(context) : undefined;
  checkAbort(signal);
  if (
    !Number.isFinite(options.scale) ||
    options.scale < 0.25 ||
    options.scale > 4 ||
    !Number.isFinite(options.width) ||
    options.width < 100 ||
    options.width > 10000 ||
    !Number.isFinite(options.margin) ||
    options.margin < 0 ||
    options.margin > 50 ||
    !["A4", "Letter", "Legal"].includes(options.paper)
  )
    throw new Error("Invalid export dimensions or resolution.");
  if (
    context &&
    (context.documentId !== snapshot.id ||
      context.revision !== snapshot.revision)
  )
    throw new Error("Export context belongs to another document revision.");
  if (options.includeAnnotations) {
    if (!annotations) throw new Error("No annotations supplied.");
    validateAnnotations(annotations, snapshot);
  }
  const rendered = await renderDocument(snapshot);
  const warnings = [...rendered.diagnostics];
  const { host, article } = makeSurface(
    context?.html ??
      (options.includeAnnotations ? annotations?.previewHtml : undefined) ??
      rendered.html,
    options,
    annotations,
    context,
  );
  try {
    const diagramErrors = await renderDiagrams(article);
    const resourceErrors = await waitForResources(article, signal);
    for (const message of [...diagramErrors, ...resourceErrors])
      warnings.push({
        severity: "error",
        code: "RESOURCE_RENDER",
        line: 1,
        message,
      });
    if (options.includeAnnotations && annotations)
      verifyGeometry(article, annotations);
    if (
      warnings.some((warning) => warning.severity === "error") &&
      !options.allowWarnings
    )
      throw new BrowserExportPreflightError(warnings);
    if (options.allowWarnings && warnings.length) {
      const report = document.createElement("section");
      report.innerHTML = `<h2>Export diagnostics</h2>${warnings.map((warning) => `<p>${escapeHtml(warning.message)}</p>`).join("")}`;
      article.append(report);
    }

    if (options.format === "html") {
      const css = await standaloneCss(signal);
      const background = options.theme === "dark" ? "#202822" : "#ffffff";
      for (const image of article.querySelectorAll("img")) {
        if (image.src.startsWith("data:")) continue;
        const response = await fetch(image.src, { signal });
        if (!response.ok) throw new Error("HTML image failed to load.");
        image.src = await blobToDataUrl(await response.blob());
      }
      const standalone = host.cloneNode(true) as HTMLElement;
      standalone.style.cssText = `position:relative;width:${article.offsetWidth}px;margin:0 auto;isolation:isolate`;
      const source = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Document</title><style>${css}\nhtml,body{margin:0;display:block;overflow:auto;height:auto;min-height:100%;background:${background}}body{padding:24px;box-sizing:border-box}*,*:before,*:after{box-sizing:border-box}</style></head><body>${standalone.outerHTML}</body></html>`;
      return {
        artifact: {
          name: "document.html",
          mime: "text/html",
          blob: new Blob([source], { type: "text/html" }),
        },
        warnings,
      };
    }

    if (options.format === "png" && options.pngMode === "selection") {
      if (!/^block-\d+$/.test(options.selection ?? ""))
        throw new Error("Select a rendered block first.");
      const selected = article.querySelector<HTMLElement>(
        `#${options.selection}`,
      );
      if (!selected) throw new Error("Selected block no longer exists.");
      const r = selected.getBoundingClientRect(),
        origin = host.getBoundingClientRect();
      const canvas = await capture(host, options, signal, {
        x: r.left - origin.left,
        y: r.top - origin.top,
        width: r.width,
        height: r.height,
      });
      try {
        return {
          artifact: {
            name: "document.png",
            mime: "image/png",
            blob: await canvasBlob(canvas),
          },
          warnings,
        };
      } finally {
        canvas.width = canvas.height = 0;
      }
    }

    if (options.format === "png" && options.pngMode === "document") {
      try {
        const canvas = await capture(host, options, signal);
        try {
          return {
            artifact: {
              name: "document.png",
              mime: "image/png",
              blob: await canvasBlob(canvas),
            },
            warnings,
          };
        } finally {
          canvas.width = canvas.height = 0;
        }
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("pixel limit"))
          throw error;
        warnings.push({
          severity: "warning",
          code: "PNG_PAGES",
          line: 1,
          message:
            "Image size limit reached. Exported separate page images instead.",
        });
      }
    }

    if (options.format === "pdf") {
      return {
        artifact: {
          name: "document.pdf",
          mime: "application/pdf",
          blob: await measuredPdf(host, article, options, signal),
        },
        warnings,
      };
    }

    if (options.format === "png") {
      const files = await pageImages(host, article, options, signal);
      const zip = zipSync(files, { level: 0 });
      return {
        artifact: {
          name: "document-pages.zip",
          mime: "application/zip",
          blob: new Blob([zip], { type: "application/zip" }),
        },
        warnings,
      };
    }

    throw new Error("Unsupported export format.");
  } finally {
    host.remove();
  }
}
