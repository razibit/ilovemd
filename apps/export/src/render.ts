import { overlaySvg, validateAnnotations, type AnnotationSet } from '../../../packages/engine/src/annotations';
import { chromium, type Browser } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { zipSync } from "fflate";
import { parseIsolated } from "./parse";
import {
  renderDocument,
  escapeHtml,
  type DocumentSnapshot,
  type ExportOptions,
  type Diagnostic,
} from "@folio/engine";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../../..");
let browserPromise: Promise<Browser> | undefined;
let browserReady = false;
let cssPromise: Promise<string> | undefined;
export type ExportArtifact = { name: string; mime: string; bytes: Buffer };
export type ArtifactResult = {
  artifacts: ExportArtifact[];
  warnings: Diagnostic[];
};
export async function closeRenderer() {
  if (browserPromise) {
    await (await browserPromise).close();
    browserPromise = undefined;
    browserReady = false;
  }
}
export function isRendererReady() {
  return browserReady;
}
async function inlineCss(file: string) {
  let css = await readFile(file, "utf8");
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)];
  for (const m of urls) {
    const path = m[1].replace(/["']/g, "");
    if (path.startsWith("data:")) continue;
    const data = await readFile(resolve(dirname(file), path));
    const mime = path.endsWith("woff2") ? "font/woff2" : "font/woff";
    css = css.replace(
      m[0],
      `url(data:${mime};base64,${data.toString("base64")})`,
    );
  }
  return css;
}
export function documentCss() {
  return (cssPromise ??= (async () => {
    const css = await Promise.all([
      inlineCss(require.resolve("katex/dist/katex.min.css")),
      inlineCss(require.resolve("@fontsource/dm-sans/latin-400.css")),
      inlineCss(require.resolve("@fontsource/dm-sans/latin-600.css")),
      inlineCss(require.resolve("@fontsource/lora/latin-400.css")),
      inlineCss(
        require.resolve("@fontsource/noto-sans-bengali/bengali-400.css"),
      ),
      inlineCss(require.resolve("@fontsource/noto-sans-arabic/arabic-400.css")),
      readFile(resolve(root, "packages/themes/document.css"), "utf8"),
    ]);
    const notices = await Promise.all(
      [
        "@fontsource/dm-sans",
        "@fontsource/lora",
        "@fontsource/noto-sans-bengali",
        "@fontsource/noto-sans-arabic",
        "katex",
      ].map((name) =>
        readFile(resolve(root, "node_modules", name, "LICENSE"), "utf8"),
      ),
    );
    return (
      css.join("\n") +
      "\n/* Embedded font and renderer license notices:\n" +
      notices.join("\n").replace(/\*\//g, "* /") +
      "\n*/"
    );
  })());
}
export async function validateAssets(snapshot: DocumentSnapshot) {
  let total = 0;
  const entries = Object.entries(snapshot.assets);
  if (entries.length > 500) throw new Error("Maximum 500 assets.");
  for (const [key, asset] of entries) {
    if (
      !asset ||
      typeof asset.data !== "string" ||
      !/^[^\x00]+$/.test(key) ||
      key.length > 2000
    )
      throw new Error("Invalid asset manifest.");
    const match = asset.data.match(
      /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z\d+/=]+)$/,
    );
    if (!match)
      throw new Error("Only PNG, JPEG, WebP, GIF and sanitized SVG images are accepted.");
    const bytes = Buffer.from(match[2], "base64");
    total += bytes.length;
    if (bytes.length > 10 * 1024 * 1024 || total > 50 * 1024 * 1024)
      throw new Error("Asset size limit exceeded.");
    if (match[1] === "svg+xml") {
      const svg = bytes.toString("utf8");
      if (!/^\s*<svg\b/i.test(svg) || /<\s*(script|foreignObject|style)\b/i.test(svg) || /\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(svg) || /url\s*\(/i.test(svg))
        throw new Error("SVG contains unsafe or unsupported content.");
      continue;
    }
    const meta = await sharp(bytes, { limitInputPixels: 32000000 }).metadata();
    if (
      !["png", "jpeg", "webp", "gif"].includes(meta.format ?? "") ||
      meta.format !== match[1]
    )
      throw new Error("Image signature does not match its declared type.");
  }
  // Inline data images must pass the same decoder and size checks.
  for (const match of snapshot.source.matchAll(/data:image\/[^\s)]+/g)) {
    const data = match[0];
    if (!Object.values(snapshot.assets).some((a) => a.data === data)) {
      const m = data.match(
        /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z\d+/=]+)$/,
      );
      if (!m) throw new Error("Invalid inline image.");
      const bytes = Buffer.from(m[2], "base64");
      total += bytes.length;
      if (bytes.length > 10 * 1024 * 1024 || total > 50 * 1024 * 1024)
        throw new Error("Inline asset limit exceeded.");
      if (m[1] === "svg+xml") {
        const svg = bytes.toString("utf8");
        if (/<\s*(script|foreignObject|style)\b/i.test(svg) || /\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(svg) || /url\s*\(/i.test(svg)) throw new Error("Inline SVG contains unsafe content.");
      } else await sharp(bytes, { limitInputPixels: 32000000 }).metadata();
    }
  }
}
export class PreflightError extends Error {
  constructor(public diagnostics: Diagnostic[]) {
    super(
      "Export needs attention. Resolve the diagnostics or explicitly export with warnings.",
    );
  }
}
export async function createArtifacts(
  snapshot: DocumentSnapshot,
  options: ExportOptions,
  signal?: AbortSignal,
  annotations?: AnnotationSet,
): Promise<ArtifactResult> {
  await validateAssets(snapshot);
  const annotated = !!options.includeAnnotations;
  if (annotated) { if (!annotations) throw new Error("No annotations supplied."); validateAnnotations(annotations, snapshot); }
  const rendered = await parseIsolated(snapshot, signal);
  const warnings = [...rendered.diagnostics];
  if (warnings.some((x) => x.severity === "error") && !options.allowWarnings)
    throw new PreflightError(warnings);
  const css = await documentCss();
  const bg = options.theme === "dark" ? "#202822" : "#ffffff";
  const layoutCss = annotated && annotations ? `main.document{position:relative;width:${annotations.layout.width}px!important;max-width:none!important;min-height:${annotations.layout.height}px;padding:${annotations.layout.padding.map(x=>`${x}px`).join(' ')};border:1px solid transparent;font-size:${annotations.layout.fontSize}px;--doc-font:${annotations.layout.fontSize}px;--doc-leading:${annotations.layout.lineHeight}}main.document .folio-columns{column-count:${(annotations.layout.mediaWidth ?? 1440) <= 650 ? 1 : 2}}main.document h1{font-size:2.55em}main.document h2{font-size:1.32em}main.document .folio-note{font-family:"DM Sans",sans-serif;font-size:.88em}` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Folio document</title><style>${css}\n${layoutCss}\nhtml,body{margin:0;background:${bg}}body{padding:32px}main{max-width:100%;box-sizing:border-box}@page{size:${options.paper} ${options.landscape ? "landscape" : "portrait"};margin:${options.margin}mm}@media print{body{padding:0}}</style></head><body><main class="document" role="document" aria-label="Markdown document" data-theme="${options.theme}">${rendered.html}${annotated && annotations ? overlaySvg(annotations) : ""}</main><script type="module" src="http://folio.internal/assets/export-runtime.js"></script></body></html>`;
  if (signal?.aborted) throw new Error("Export cancelled.");
  browserPromise ??= chromium.launch({
    headless: true,
    chromiumSandbox: process.platform === "linux",
  });
  let browser: Browser;
  try {
    browser = await browserPromise;
    browserReady = true;
  } catch (error) {
    browserPromise = undefined;
    browserReady = false;
    throw error;
  }
  const context = await browser.newContext({
    viewport: { width: annotated ? (annotations!.layout.mediaWidth ?? options.width) : options.width, height: 900 },
    deviceScaleFactor: options.scale,
    serviceWorkers: "block",
  });
  const timer = setTimeout(() => void context.close(), 60000);
  const abort = () => void context.close();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "http://folio.internal") {
        if (url.pathname === "/document") {
            await route.fulfill({ contentType: "text/html", body: html,headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'"} });
          return;
        }
        if (url.pathname.startsWith("/assets/")) {
          const file = resolve(root, "apps/web/dist", `.${url.pathname}`);
          const allowed = resolve(root, "apps/web/dist/assets");
          if (
            !file.startsWith(allowed + "/") &&
            !file.startsWith(allowed + "\\")
          ) {
            await route.abort();
            return;
          }
          try {
            await route.fulfill({
              body: await readFile(file),
              contentType:
                extname(file) === ".css"
                  ? "text/css"
                  : "application/javascript",
            });
            return;
          } catch {}
        }
      }
      await route.abort();
    });
    const page = await context.newPage();
    await page.goto("http://folio.internal/document");
    await page.waitForFunction(
      () => !!window.folioReady,
      {},
      { timeout: 20000 },
    );
    const runtimeErrors = await page.evaluate(() => window.folioReady);
    for (const message of runtimeErrors)
      warnings.push({
        severity: "error",
        code: "RESOURCE_RENDER",
        line: 1,
        message,
      });
    if (!annotated && (options.format === "pdf" || options.pngMode === "pages")) {
      const sizes = {
        A4: [210, 297],
        Letter: [215.9, 279.4],
        Legal: [215.9, 355.6],
      };
      let [w, h] = sizes[options.paper];
      if (options.landscape) [w, h] = [h, w];
      await page.setViewportSize({
        width: Math.floor(
          ((w - 2 * options.margin) * 96) / 25.4 / options.scale,
        ),
        height: Math.floor(
          ((h - 2 * options.margin) * 96) / 25.4 / options.scale,
        ),
      });
      await page.emulateMedia({ media: "print" });
      const overflow = await page.evaluate(() => {
        const root = document.querySelector("main")!;
        const width = root.getBoundingClientRect().width;
        return [
          ...root.querySelectorAll<HTMLElement>(
            "table,pre,.math-display,figure,tr",
          ),
        ]
          .filter(
            (e) =>
              e.scrollWidth > width + 2 ||
              ((["TR", "FIGURE"].includes(e.tagName) ||
                e.classList.contains("math-display")) &&
                e.getBoundingClientRect().height > innerHeight),
          )
          .map((e) => ({
            line: Number(e.dataset.sourceStart) || 1,
            tag: e.tagName,
          }));
      });
      overflow.forEach((e) =>
        warnings.push({
          severity: "error",
          code: "PRINT_OVERFLOW",
          line: e.line,
          message: `${e.tag} exceeds the printable area. Change orientation, margins or scale.`,
        }),
      );
    }
    if (annotated && annotations) {
      if (annotations.blocks) {
        const mismatch = await page.evaluate(blocks => {
          const root = document.querySelector('main')!.getBoundingClientRect();
          return blocks.find(b => { const el=document.getElementById(b.id); if (!el) return true; const r=el.getBoundingClientRect(); return Math.abs(r.x-root.x-b.x)>1.5 || Math.abs(r.y-root.y-b.y)>1.5 || Math.abs(r.width-b.width)>1.5 || Math.abs(r.height-b.height)>1.5; });
        },annotations.blocks);
        if (mismatch) throw new Error(`Annotated block ${mismatch.id} changed layout. Restore the original resources or review the notes before exporting.`);
      }
      const measured = await page.locator('main').evaluate(el => (el as HTMLElement).offsetHeight);
      if (Math.abs(measured - annotations.layout.height) > 3) throw new Error('The annotated layout could not be reproduced exactly. Review resource availability and restore the original reading settings.');
      if (options.format === 'pdf' || options.pngMode === 'pages') {
        const dimensions = { A4:[210,297], Letter:[215.9,279.4], Legal:[215.9,355.6] };
        const size = dimensions[options.paper];
        const w = (options.landscape ? size[1] : size[0]) - options.margin*2;
        const h = (options.landscape ? size[0] : size[1]) - options.margin*2;
        await page.emulateMedia({media:'screen'});
        await page.evaluate(({width,height,sourceWidth,sourceHeight}) => {
          const main = document.querySelector('main')!;
          const factor = width/sourceWidth, slice = height/factor;
          const count = Math.ceil(sourceHeight/slice);
          if (count > 200) throw new Error('More than 200 annotated pages. Split the document.');
          document.body.style.padding='0';
          for (let i=0;i<count;i++) {
            const sheet=document.createElement('div');
            sheet.className='annotated-sheet';
            sheet.style.cssText=`position:relative;width:${width}px;height:${height-.1}px;overflow:hidden;break-after:${i===count-1?'auto':'page'};break-inside:avoid`;
            const copy=main.cloneNode(true) as HTMLElement;
            copy.style.cssText=`position:absolute;left:0;top:${-i*height}px;margin:0;transform:scale(${factor});transform-origin:top left`;
            sheet.append(copy);document.body.append(sheet);
          }
          main.remove();
        },{width:w*96/25.4,height:h*96/25.4,sourceWidth:annotations.layout.width,sourceHeight:annotations.layout.height});
      }
    }
    if (warnings.some((x) => x.severity === "error") && !options.allowWarnings)
      throw new PreflightError(warnings);
    if (options.allowWarnings && warnings.length)
      await page.evaluate(
        (messages) => {
          const section = document.createElement("section");
          section.className = "document";
          const h = document.createElement("h2");
          h.textContent = "Export diagnostics";
          section.append(h);
          for (const message of messages) {
            const p = document.createElement("p");
            p.textContent = message;
            section.append(p);
          }
          document.body.append(section);
        },
        warnings.map((w) => w.message),
      );
    const artifacts: ExportArtifact[] = [];
    if (options.format === "html") {
      const content = await page.locator("main").innerHTML();
      const report = options.allowWarnings && warnings.length
        ? `<section><h2>Export diagnostics</h2>${warnings.map((w) => `<p>${escapeHtml(w.message)}</p>`).join("")}</section>`
        : "";
      artifacts.push({
        name: "document.html",
        mime: "text/html",
        bytes: Buffer.from(
          `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Document</title><style>${css}${layoutCss}body{margin:0;padding:48px;background:${bg}}main{max-width:850px;margin:auto}</style></head><body><main class="document" role="document" aria-label="Markdown document" data-theme="${options.theme}">${content}${report}</main></body></html>`,
        ),
      });
    } else if (options.format === "pdf")
      artifacts.push({
        name: "document.pdf",
        mime: "application/pdf",
        bytes: await page.pdf({
          format: options.paper,
          landscape: options.landscape,
          preferCSSPageSize: true,
          printBackground: true,
          tagged: true,
          outline: true,
          scale: annotated ? 1 : options.scale,
        }),
      });
    else {
      let pages = options.pngMode === "pages";
      let target = page.locator(annotated && options.pngMode === "document" ? "main" : "body");
      if (options.pngMode === "selection") {
        if (!/^block-\d+$/.test(options.selection ?? ""))
          throw new Error("Select a rendered block first.");
        target = page.locator(`#${options.selection}`);
        if (!(await target.count()))
          throw new Error("Selected block no longer exists.");
      }
      const size = await target.boundingBox();
      if (!size) throw new Error("Nothing to export.");
      if (
        size.width * size.height * options.scale ** 2 > 32000000 ||
        Math.max(size.width, size.height) * options.scale > 16384
      ) {
        if(options.pngMode==='selection')throw new Error('Selected block exceeds the image limit. Reduce width or scale.');
        if(options.pngMode!=='pages'){
          const fallback: ArtifactResult = await createArtifacts(snapshot,{...options,pngMode:'pages'},signal,annotations);
          fallback.warnings.push({severity:'warning',code:'PNG_PAGES',line:1,message:'Image size limit reached. Exported separate PDF page images instead.'});
          return fallback;
        }
        pages = true;
        warnings.push({
          severity: "warning",
          code: "PNG_PAGES",
          line: 1,
          message:
            "Image size limit reached. Exported separate PDF page images instead.",
        });
      }
      if (pages) {
        await page.emulateMedia({ media: annotated ? "screen" : "print" });
        const pdf = await page.pdf({
          format: options.paper,
          landscape: options.landscape,
          preferCSSPageSize: true,
          printBackground: true,
          scale: annotated ? 1 : options.scale,
        });
        const images = await page.evaluate(
          async ({ data, scale }) => window.folioPdfPages(data, scale),
          { data: pdf.toString("base64"), scale: options.scale * 1.5 },
        );
        const zip: Record<string, Uint8Array> = {};
        images.forEach(
          (data, i) =>
            (zip[`page-${String(i + 1).padStart(3, "0")}.png`] = Buffer.from(
              data,
              "base64",
            )),
        );
        artifacts.push({
          name: "document-pages.zip",
          mime: "application/zip",
          bytes: Buffer.from(zipSync(zip, { level: 0 })),
        });
      } else {
        if (options.background === "transparent")
          await page.addStyleTag({
            content: "html,body,.document{background:transparent!important}",
          });
        artifacts.push({
          name: "document.png",
          mime: "image/png",
          bytes: annotated && options.pngMode === 'selection'
            ? await page.screenshot({ clip: size, omitBackground:options.background === 'transparent', animations:'disabled' })
            : await target.screenshot({ omitBackground: options.background === "transparent", animations: "disabled" }),
        });
      }
    }
    if (
      artifacts.reduce((size, a) => size + a.bytes.length, 0) >
      64 * 1024 * 1024
    )
      throw new Error(
        "Export exceeds the 64 MiB artifact limit. Split the document or reduce image scale.",
      );
    return { artifacts, warnings };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    await context.close();
  }
}
