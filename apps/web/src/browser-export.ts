import html2canvas from "html2canvas";
import { zipSync } from "fflate";
import bengaliFontUrl from "@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf?url";
import arabicFontUrl from "@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf?url";
import symbolFontUrl from "@expo-google-fonts/noto-sans-symbols-2/400Regular/NotoSansSymbols2_400Regular.ttf?url";
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
const MAX_PAGES = 200;
const MM_TO_PX = 96 / 25.4;
const MM_TO_PT = 72 / 25.4;
const paperSizes = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
} as const;

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

async function prepareVectorPdfMarkup(
  article: HTMLElement,
  options: ExportOptions,
  signal?: AbortSignal,
) {
  const clone = article.cloneNode(true) as HTMLElement;
  for (const selector of [".katex", ".diagram"] as const) {
    const originals = [...article.querySelectorAll<HTMLElement>(selector)];
    const copies = [...clone.querySelectorAll<HTMLElement>(selector)];
    for (let index = 0; index < originals.length; index++) {
      checkAbort(signal);
      const original = originals[index];
      const copy = copies[index];
      if (!copy) continue;
      const canvas = await html2canvas(original, {
        backgroundColor: null,
        scale: Math.max(2, options.scale),
        logging: false,
        useCORS: false,
      });
      const image = document.createElement("img");
      image.src = canvas.toDataURL("image/png");
      image.alt = original.getAttribute("aria-label") || original.textContent?.trim() || selector;
      image.width = Math.ceil(original.getBoundingClientRect().width);
      image.height = Math.ceil(original.getBoundingClientRect().height);
      image.dataset.pdfmake = JSON.stringify({ width: Math.min(image.width * 0.75, 480) });
      copy.replaceWith(image);
    }
  }

  for (const table of clone.querySelectorAll<HTMLTableElement>("table")) {
    const rows = [...table.rows];
    const explicitHeaders = table.tHead?.rows.length ?? 0;
    const leadingHeaderRows = rows.findIndex((row) =>
      [...row.cells].some((cell) => cell.tagName !== "TH"),
    );
    const headerRows = explicitHeaders || (leadingHeaderRows < 0 ? rows.length : leadingHeaderRows);
    if (headerRows > 0 && headerRows < rows.length)
      table.dataset.pdfmake = JSON.stringify({ headerRows, keepWithHeaderRows: 1 });
  }

  for (const image of clone.querySelectorAll<HTMLImageElement>("img")) {
    checkAbort(signal);
    if (image.src.startsWith("data:")) continue;
    const response = await fetch(image.src);
    if (!response.ok) throw new Error(`Image failed to load for PDF: HTTP ${response.status}`);
    image.src = await blobToDataUrl(await response.blob());
  }
  return clone.innerHTML;
}

function walkPdfNodes(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkPdfNodes(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  visit(node);
  Object.values(node).forEach((child) => walkPdfNodes(child, visit));
}

function splitContinuedTables(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(splitContinuedTables);
  if (!value || typeof value !== "object") return value;
  const node = value as Record<string, unknown>;
  if (node.table && typeof node.table === "object") {
    const table = node.table as Record<string, unknown>;
    const body = Array.isArray(table.body) ? table.body : [];
    if (body.length > 19) {
      const header = body[0];
      const chunks: Record<string, unknown>[] = [];
      for (let index = 1; index < body.length; index += 18) {
        chunks.push({
          ...node,
          pageBreak: index === 1 ? node.pageBreak : "before",
          table: {
            ...table,
            body: [structuredClone(header), ...body.slice(index, index + 18)],
            headerRows: 1,
            dontBreakRows: true,
          },
        });
      }
      return { stack: chunks };
    }
  }
  for (const [key, child] of Object.entries(node)) node[key] = splitContinuedTables(child);
  return node;
}

async function fontFile(url: string, signal?: AbortSignal) {
  checkAbort(signal);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PDF font failed to load: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function applyUnicodeFonts(node: Record<string, unknown>) {
  if (typeof node.text !== "string" || typeof node.font === "string") return;
  const runs: { text: string; font: string }[] = [];
  for (const character of node.text) {
    const font = /\p{Script=Bengali}/u.test(character)
      ? "NotoBengali"
      : /\p{Script=Arabic}/u.test(character)
        ? "NotoArabic"
        : character.codePointAt(0)! > 0x7f
          ? "Symbols"
          : "Roboto";
    const previous = runs.at(-1);
    if (previous?.font === font) previous.text += character;
    else runs.push({ text: character, font });
  }
  if (runs.length === 1) {
    if (runs[0].font !== "Roboto") node.font = runs[0].font;
  } else if (runs.some((run) => run.font !== "Roboto")) node.text = runs;
}

async function createVectorPdf(
  article: HTMLElement,
  options: ExportOptions,
  signal?: AbortSignal,
) {
  checkAbort(signal);
  const [{ default: pdfMake }, { default: pdfFonts }, { default: htmlToPdfmake }] =
    await Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
      import("html-to-pdfmake"),
    ]);
  checkAbort(signal);
  const [bengaliFont, arabicFont, symbolFont] = await Promise.all([
    fontFile(bengaliFontUrl, signal),
    fontFile(arabicFontUrl, signal),
    fontFile(symbolFontUrl, signal),
  ]);
  const fontVfs = {
    ...pdfFonts,
    "NotoSansBengali.ttf": bengaliFont,
    "NotoSansArabic.ttf": arabicFont,
    "NotoSansSymbols2.ttf": symbolFont,
  };
  const fonts = {
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
    NotoBengali: {
      normal: "NotoSansBengali.ttf",
      bold: "NotoSansBengali.ttf",
      italics: "NotoSansBengali.ttf",
      bolditalics: "NotoSansBengali.ttf",
    },
    NotoArabic: {
      normal: "NotoSansArabic.ttf",
      bold: "NotoSansArabic.ttf",
      italics: "NotoSansArabic.ttf",
      bolditalics: "NotoSansArabic.ttf",
    },
    Symbols: {
      normal: "NotoSansSymbols2.ttf",
      bold: "NotoSansSymbols2.ttf",
      italics: "NotoSansSymbols2.ttf",
      bolditalics: "NotoSansSymbols2.ttf",
    },
  };
  const markup = await prepareVectorPdfMarkup(article, options, signal);
  const content = htmlToPdfmake(markup, {
    window,
    removeExtraBlanks: true,
    tableAutoSize: true,
  }) as unknown;

  walkPdfNodes(content, (node) => {
    applyUnicodeFonts(node);
    if (node.table && typeof node.table === "object") {
      const table = node.table as Record<string, unknown>;
      const body = Array.isArray(table.body) ? table.body : [];
      const columnCount = Array.isArray(body[0]) ? body[0].length : 0;
      if (!Array.isArray(table.widths) && columnCount)
        table.widths = Array(columnCount).fill("*");
      if (body.length > 1 && columnCount > 0) {
        table.body = [
          (body[0] as Record<string, unknown>[]).map((cell) => ({
            text: cell.text ?? "",
            bold: true,
            fillColor: cell.fillColor ?? "#eeeeee",
          })),
          ...body.slice(1),
        ];
        table.headerRows = 1;
        delete table.keepWithHeaderRows;
      }
      if (typeof node.headerRows === "number" && table.headerRows === undefined)
        table.headerRows = node.headerRows;
    }
  });
  const paginatedContent = splitContinuedTables(content);

  const background = options.theme === "dark" ? "#202822" : "#ffffff";
  const foreground = options.theme === "dark" ? "#f1f5f2" : "#172019";
  const documentDefinition = {
    tagged: true,
    displayTitle: true,
    language: document.documentElement.lang || "en",
    info: { title: "iLoveMd document", creator: "iLoveMd browser export" },
    pageSize: options.paper,
    pageOrientation: options.landscape ? "landscape" : "portrait",
    pageMargins: Array(4).fill(options.margin * MM_TO_PT),
    background: () => ({ canvas: [{ type: "rect", x: 0, y: 0, w: 2000, h: 2000, color: background }] }),
    defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.32, color: foreground },
    content: paginatedContent,
  };
  const output = pdfMake.createPdf(documentDefinition, undefined, fonts, fontVfs);
  const blob = await new Promise<Blob>((resolve, reject) => {
    try {
      output.getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
  checkAbort(signal);
  return blob;
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
          return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join("\n");
    const urls = [...new Set([...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]))];
    let inlined = css;
    await Promise.all(
      urls.map(async (value) => {
        if (/^(data:|blob:|#)/i.test(value)) return;
        checkAbort(signal);
        try {
          const response = await fetch(new URL(value, document.baseURI));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          inlined = inlined.split(value).join(data);
        } catch {
          // Export preflight independently reports document resource failures.
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

function makeSurface(
  html: string,
  options: ExportOptions,
  annotations?: AnnotationSet,
) {
  const host = document.createElement("div");
  const article = document.createElement("article");
  const annotated = !!options.includeAnnotations && !!annotations;
  host.dataset.exportSurface = "true";
  host.style.cssText = [
    "position:fixed",
    "inset:0 auto auto 0",
    "z-index:-2147483647",
    "pointer-events:none",
    "box-sizing:border-box",
    `background:${options.background === "transparent" ? "transparent" : options.theme === "dark" ? "#202822" : "#fff"}`,
    `width:${options.width}px`,
    "padding:32px",
  ].join(";");
  article.className = "document";
  article.dataset.theme = options.theme;
  article.style.boxSizing = "border-box";
  article.style.maxWidth = "none";
  article.style.width = annotated ? `${annotations.layout.width}px` : "100%";
  if (annotated) {
    article.dataset.annotated = "true";
    article.style.minHeight = `${annotations.layout.height}px`;
    article.style.padding = annotations.layout.padding.map((x) => `${x}px`).join(" ");
    article.style.setProperty("--doc-font", `${annotations.layout.fontSize}px`);
    article.style.setProperty("--doc-leading", String(annotations.layout.lineHeight));
    article.style.setProperty(
      "--annotation-columns",
      (annotations.layout.mediaWidth ?? innerWidth) <= 650 ? "1" : "2",
    );
  }
  article.innerHTML = html + (annotated ? overlaySvg(annotations) : "");
  host.append(article);
  document.body.append(host);
  return { host, article };
}

async function capture(
  target: HTMLElement,
  options: ExportOptions,
  signal?: AbortSignal,
  crop?: { y: number; height: number },
) {
  checkAbort(signal);
  const width = Math.ceil(target.scrollWidth);
  const height = Math.ceil(crop?.height ?? target.scrollHeight);
  if (width * height * options.scale ** 2 > MAX_PIXELS)
    throw new Error("Page exceeds the image pixel limit. Reduce scale or export page images.");
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
    x: 0,
    y: crop?.y ?? 0,
    width,
    height,
    windowWidth: width,
    windowHeight: Math.max(target.scrollHeight, height),
  });
  checkAbort(signal);
  return canvas;
}

function pageGeometry(options: ExportOptions) {
  const size = [...paperSizes[options.paper]] as [number, number];
  if (options.landscape) size.reverse();
  return {
    widthMm: size[0],
    heightMm: size[1],
    contentWidthPx: Math.floor((size[0] - options.margin * 2) * MM_TO_PX),
    contentHeightPx: Math.floor((size[1] - options.margin * 2) * MM_TO_PX),
  };
}

async function pageCanvases(
  article: HTMLElement,
  options: ExportOptions,
  signal?: AbortSignal,
) {
  const geometry = pageGeometry(options);
  article.parentElement!.style.width = `${geometry.contentWidthPx + 64}px`;
  article.style.width = `${geometry.contentWidthPx}px`;
  await new Promise(requestAnimationFrame);
  const height = article.scrollHeight;
  const articleTop = article.getBoundingClientRect().top;
  const boundaries = [...article.querySelectorAll<HTMLElement>(
    "h1,h2,h3,h4,p,li,tr,pre,figure,.math-display,.folio-note,.diagram-container",
  )].map((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top - articleTop, bottom: rect.bottom - articleTop };
  });
  const slices: { y: number; height: number }[] = [];
  let start = 0;
  while (start < height) {
    const idealEnd = Math.min(start + geometry.contentHeightPx, height);
    let end = idealEnd;
    const crossing = boundaries
      .filter(
        (boundary) =>
          boundary.top > start + 48 &&
          boundary.top < idealEnd &&
          boundary.bottom > idealEnd &&
          boundary.bottom - boundary.top < geometry.contentHeightPx * 0.9,
      )
      .sort((a, b) => a.top - b.top)[0];
    if (crossing) end = crossing.top;
    slices.push({ y: start, height: Math.max(1, end - start) });
    start = end;
    if (slices.length > MAX_PAGES)
      throw new Error("More than 200 pages. Split the document before exporting.");
  }
  const pages: HTMLCanvasElement[] = [];
  for (const slice of slices) {
    checkAbort(signal);
    pages.push(await capture(article, options, signal, slice));
  }
  return { pages, geometry };
}

export async function createBrowserArtifact(
  snapshot: DocumentSnapshot,
  options: ExportOptions,
  signal?: AbortSignal,
  annotations?: AnnotationSet,
): Promise<BrowserArtifactResult> {
  checkAbort(signal);
  if (options.includeAnnotations) {
    if (!annotations) throw new Error("No annotations supplied.");
    validateAnnotations(annotations, snapshot);
  }
  const rendered = await renderDocument(snapshot);
  const warnings = [...rendered.diagnostics];
  const { host, article } = makeSurface(rendered.html, options, annotations);
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
    if (warnings.some((warning) => warning.severity === "error") && !options.allowWarnings)
      throw new BrowserExportPreflightError(warnings);
    if (options.allowWarnings && warnings.length) {
      const report = document.createElement("section");
      report.innerHTML = `<h2>Export diagnostics</h2>${warnings.map((warning) => `<p>${escapeHtml(warning.message)}</p>`).join("")}`;
      article.append(report);
    }

    if (options.format === "html") {
      const css = await standaloneCss(signal);
      const background = options.theme === "dark" ? "#202822" : "#ffffff";
      const source = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Document</title><style>${css}\nhtml,body{margin:0;overflow:auto;background:${background}}body{padding:48px}main.document{max-width:850px;margin:auto}</style></head><body><main class="document" role="document" aria-label="Markdown document" data-theme="${options.theme}">${article.innerHTML}</main></body></html>`;
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
      const selected = article.querySelector<HTMLElement>(`#${options.selection}`);
      if (!selected) throw new Error("Selected block no longer exists.");
      const canvas = await capture(selected, options, signal);
      return {
        artifact: { name: "document.png", mime: "image/png", blob: await canvasBlob(canvas) },
        warnings,
      };
    }

    if (options.format === "png" && options.pngMode === "document") {
      try {
        const canvas = await capture(host, options, signal);
        return {
          artifact: { name: "document.png", mime: "image/png", blob: await canvasBlob(canvas) },
          warnings,
        };
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("pixel limit")) throw error;
        warnings.push({
          severity: "warning",
          code: "PNG_PAGES",
          line: 1,
          message: "Image size limit reached. Exported separate page images instead.",
        });
      }
    }

    if (options.format === "pdf") {
      return {
        artifact: {
          name: "document.pdf",
          mime: "application/pdf",
          blob: await createVectorPdf(article, options, signal),
        },
        warnings,
      };
    }

    const { pages } = await pageCanvases(article, options, signal);
    if (options.format === "png") {
      const files: Record<string, Uint8Array> = {};
      for (let index = 0; index < pages.length; index++) {
        const bytes = new Uint8Array(await (await canvasBlob(pages[index])).arrayBuffer());
        files[`page-${String(index + 1).padStart(3, "0")}.png`] = bytes;
      }
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
