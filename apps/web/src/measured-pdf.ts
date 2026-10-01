import { elementToSVG } from "dom-to-svg";
import html2canvas from "html2canvas";
import type { ExportOptions } from "@folio/engine";
import { measuredPages } from "./export-geometry";
import lora from "@fontsource/lora/files/lora-latin-400-normal.woff?url";
import dm400 from "@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url";
import dm500 from "@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff?url";
import dm600 from "@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff?url";
import bengali from "@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf?url";
import arabic from "@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf?url";
import symbols from "@expo-google-fonts/noto-sans-symbols-2/400Regular/NotoSansSymbols2_400Regular.ttf?url";
const NS = "http://www.w3.org/2000/svg";
function abort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException("Export cancelled.", "AbortError");
}
async function font(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`PDF font failed to load: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
function family(text: string, css: CSSStyleDeclaration) {
  return /\p{Script=Bengali}/u.test(text)
    ? "NotoBengali"
    : /\p{Script=Arabic}/u.test(text)
      ? "NotoArabic"
      : /[\u2600-\u{1ffff}]/u.test(text)
        ? "Symbols"
        : css.fontFamily.includes("DM Sans")
          ? `DM${Number(css.fontWeight) >= 600 ? 600 : Number(css.fontWeight) >= 500 ? 500 : 400}`
          : "Lora";
}

/** DOM graphics plus measured text. Never use the package's Selection.toString(),
 * which trims whitespace between adjacent inline nodes. All coordinates remain
 * in the same unscaled browser CSS space, then a page viewBox clips them. */
export async function measuredPdf(
  surface: HTMLElement,
  article: HTMLElement,
  options: ExportOptions,
  signal?: AbortSignal,
) {
  abort(signal);
  const { default: pdfMake } = await import("pdfmake/build/pdfmake");
  const urls = {
    Lora: lora,
    DM400: dm400,
    DM500: dm500,
    DM600: dm600,
    NotoBengali: bengali,
    NotoArabic: arabic,
    Symbols: symbols,
  };
  const entries = await Promise.all(
    Object.entries(urls).map(
      async ([name, url]) => [name, await font(url, signal)] as const,
    ),
  );
  const vfs = Object.fromEntries(
    entries.map(([name, data]) => [`${name}.font`, data]),
  );
  const fonts = Object.fromEntries(
    entries.map(([name]) => [
      name,
      {
        normal: `${name}.font`,
        bold: `${name}.font`,
        italics: `${name}.font`,
        bolditalics: `${name}.font`,
      },
    ]),
  );
  const restoreIds: (() => void)[] = [];
  let id = 0;
  for (const el of [surface, ...surface.querySelectorAll<HTMLElement>("*")])
    if (!el.id) {
      const generated = `pdf-node-${++id}`;
      el.id = generated;
      restoreIds.push(() => el.removeAttribute("id"));
    }
  const selection = window.getSelection(),
    selected = selection?.rangeCount
      ? selection.getRangeAt(0).cloneRange()
      : undefined;
  try {
    const svgDoc = elementToSVG(surface),
      svg = svgDoc.documentElement;
    // Resource CSS is unnecessary for PDF; compatible fonts are explicitly embedded.
    svg.querySelectorAll("style").forEach((s) => s.remove());
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d")!;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_ELEMENT);
    const elements = [article];
    while (walker.nextNode()) elements.push(walker.currentNode as HTMLElement);
    for (const el of elements) {
      if (el.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
      const group = svg.querySelector(`#${CSS.escape(el.id)}`);
      if (!group) continue;
      const direct = [...el.childNodes].filter(
        (n) => n.nodeType === Node.TEXT_NODE,
      ) as Text[];
      if (!direct.length) continue;
      // Remove only this element's own text, preserving descendants and pseudo-elements.
      [...group.querySelectorAll("text")]
        .filter((n) => n.closest("[data-tag]") === group)
        .forEach((n) => n.remove());
      const css = getComputedStyle(el),
        size = parseFloat(css.fontSize);
      ctx.font = `${css.fontStyle} ${css.fontWeight} ${size}px ${css.fontFamily}`;
      const metrics = ctx.measureText("Mg"),
        descent =
          metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
      for (const node of direct) {
        const text = svgDoc.createElementNS(NS, "text");
        text.setAttribute("font-family", family(node.data, css));
        text.setAttribute("font-size", String(size));
        text.setAttribute("fill", css.color);
        text.setAttribute("xml:space", "preserve");
        // Preserve each browser-measured line, including spaces and shaped scripts.
        const range = document.createRange();
        let run = "",
          first = 0,
          lastRect: DOMRect | undefined,
          runFamily = "";
        const emit = () => {
          if (!run || !lastRect) return;
          range.setStart(node, first);
          range.setEnd(node, first + run.length);
          const r = range.getBoundingClientRect();
          const span = svgDoc.createElementNS(NS, "tspan");
          span.setAttribute("xml:space", "preserve");
          span.setAttribute("style", "white-space:pre");
          span.setAttribute("font-family", runFamily);
          span.setAttribute("x", String(r.x));
          span.setAttribute("y", String(r.bottom - descent));
          span.setAttribute("textLength", String(r.width));
          span.setAttribute("lengthAdjust", "spacingAndGlyphs");
          span.textContent = run
            .replace(/\t/g, " ")
            .replace(/(^ +| +$)/g, (m) => "\u00a0".repeat(m.length));
          text.append(span);
        };
        for (
          let i = 0;
          i < node.length;
          i += node.data.codePointAt(i)! > 0xffff ? 2 : 1
        ) {
          const character = String.fromCodePoint(node.data.codePointAt(i)!);
          range.setStart(node, i);
          range.setEnd(node, i + character.length);
          const r = range.getBoundingClientRect();
          if (!r.width || !r.height || /\s/u.test(character)) {
            if (run) {
              emit();
              run = "";
            }
            continue;
          }
          const nextFamily = family(character, css);
          if (
            lastRect &&
            (Math.abs(lastRect.top - r.top) > 0.5 ||
              nextFamily !== runFamily) &&
            run
          ) {
            emit();
            run = "";
          }
          if (!run) {
            first = i;
            runFamily = nextFamily;
          }
          run += character;
          lastRect = r;
        }
        emit();
        group.append(text);
        if (css.textDecorationLine === "underline") {
          const offset = parseFloat(css.textUnderlineOffset),
            thickness = parseFloat(css.textDecorationThickness);
          if (Number.isFinite(offset) && Number.isFinite(thickness)) {
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              const line = svgDoc.createElementNS(NS, "line");
              line.setAttribute("x1", String(rect.left));
              line.setAttribute("x2", String(rect.right));
              line.setAttribute("y1", String(rect.bottom - descent + offset));
              line.setAttribute("y2", String(rect.bottom - descent + offset));
              line.setAttribute("stroke", css.color);
              line.setAttribute("stroke-width", String(thickness));
              group.append(line);
            }
          }
        }
      }
    }
    // Browser-only fonts, faux bold/italics, list markers and complex math are
    // captured locally at >=300 effective DPI. The measured text remains in
    // the PDF with imperceptible opacity for searching/selecting those regions.
    const candidates = [
      ...article.querySelectorAll<HTMLElement>(
        "pre,code,strong,em,del,s,ul,ol,.katex,.diagram,[style]",
      ),
    ].filter((el) => {
      const css = getComputedStyle(el);
      return (
        ["PRE", "CODE", "STRONG", "EM", "DEL", "S", "UL", "OL"].includes(
          el.tagName,
        ) ||
        el.matches(".katex,.diagram") ||
        css.filter !== "none"
      );
    });
    const unicodeWalker = document.createTreeWalker(
      article,
      NodeFilter.SHOW_TEXT,
    );
    while (unicodeWalker.nextNode()) {
      const n = unicodeWalker.currentNode as Text;
      if (
        /[\p{Script=Bengali}\p{Script=Arabic}]/u.test(n.data) &&
        n.parentElement
      )
        candidates.push(n.parentElement);
    }
    const unsupported = [...new Set(candidates)].filter(
      (el) => !candidates.some((other) => other !== el && other.contains(el)),
    );
    const plan = measuredPages(article, options);
    for (const el of unsupported) {
      abort(signal);
      const group = svg.querySelector(`#${CSS.escape(el.id)}`);
      if (!group) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const scale = Math.max((300 / 72) * plan.scale, 2);
      if (rect.width * rect.height * scale * scale > 32_000_000)
        throw new Error(
          "An unsupported PDF region exceeds the image pixel limit. Split the document.",
        );
      const imageCanvas = await html2canvas(el, {
        backgroundColor: null,
        scale,
        logging: false,
        windowWidth: innerWidth,
        windowHeight: innerHeight,
      });
      // Keep text operators for searching and selection. svg-to-pdfkit omits
      // zero-opacity text entirely; this paint is below one 8-bit alpha step.
      // Remove other vector paints before overlaying the faithful local image.
      for (const child of [...group.querySelectorAll("*")].reverse()) {
        if (child.tagName === "text" || child.tagName === "tspan") {
          child.setAttribute("fill-opacity", "0.000001");
          child.setAttribute("stroke-opacity", "0.000001");
        } else if (!child.querySelector("text") && !child.closest("text")) {
          child.remove();
        }
      }
      const image = svgDoc.createElementNS(NS, "image");
      image.setAttribute("x", String(rect.x));
      image.setAttribute("y", String(rect.y));
      image.setAttribute("width", String(rect.width));
      image.setAttribute("height", String(rect.height));
      image.setAttributeNS(
        "http://www.w3.org/1999/xlink",
        "xlink:href",
        imageCanvas.toDataURL(),
      );
      group.append(image);
      imageCanvas.width = imageCanvas.height = 0;
    }
    // Inline image resources. Engine output normally already uses local data URLs.
    for (const image of svg.querySelectorAll("image")) {
      const href =
        image.getAttribute("href") ??
        image.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (href && !href.startsWith("data:")) {
        const response = await fetch(href, { signal });
        if (!response.ok) throw new Error("PDF image failed to load.");
        const blob = await response.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
        image.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          data,
        );
      }
    }
    const origin = surface.getBoundingClientRect();
    const content: unknown[] = [];
    const clippedSvg = (start: number, height: number) => {
      const page = svg.cloneNode(true) as Element;
      page.setAttribute("viewBox", `0 0 ${plan.width} ${height}`);
      page.setAttribute("width", String(plan.width));
      page.setAttribute("height", String(height));
      // PDF readers extract even clipped text. Remove off-page text runs as well
      // as clipping graphics, so each page has only its own selectable content.
      for (const span of page.querySelectorAll("tspan")) {
        const y = Number(span.getAttribute("y"));
        if (y < origin.y + start || y > origin.y + start + height)
          span.remove();
      }
      for (const text of page.querySelectorAll("text"))
        if (!text.textContent) text.remove();
      for (const image of page.querySelectorAll("image")) {
        const y = Number(image.getAttribute("y")),
          h = Number(image.getAttribute("height"));
        if (y + h <= origin.y + start || y >= origin.y + start + height)
          image.remove();
      }
      const clipId = `page-clip-${crypto.randomUUID()}`;
      const defs = svgDoc.createElementNS(NS, "defs"),
        clip = svgDoc.createElementNS(NS, "clipPath"),
        rect = svgDoc.createElementNS(NS, "rect");
      clip.id = clipId;
      rect.setAttribute("x", String(origin.x));
      rect.setAttribute("y", String(origin.y + start));
      rect.setAttribute("width", String(plan.width));
      rect.setAttribute("height", String(height));
      clip.append(rect);
      defs.append(clip);
      const group = svgDoc.createElementNS(NS, "g");
      group.setAttribute(
        "transform",
        `translate(${-origin.x},${-origin.y - start})`,
      );
      group.setAttribute("clip-path", `url(#${clipId})`);
      group.append(...page.childNodes);
      page.append(defs, group);
      return new XMLSerializer().serializeToString(page);
    };
    for (const [index, slice] of plan.slices.entries()) {
      abort(signal);
      const stack: unknown[] = [];
      if (slice.header)
        stack.push({
          svg: clippedSvg(slice.header.y, slice.header.height),
          width: plan.printableWidth,
        });
      stack.push({
        svg: clippedSvg(slice.y, slice.height),
        width: plan.printableWidth,
      });
      content.push({ stack, pageBreak: index ? "before" : undefined });
    }
    const background = options.theme === "dark" ? "#202822" : "#ffffff";
    const output = pdfMake.createPdf(
      {
        tagged: true,
        displayTitle: true,
        language: document.documentElement.lang || "en",
        info: { title: "iLoveMd document" },
        pageSize: {
          width: (plan.size[0] * 72) / 25.4,
          height: (plan.size[1] * 72) / 25.4,
        },
        pageMargins: Array(4).fill((options.margin * 72) / 25.4),
        background: () => ({
          canvas: [
            {
              type: "rect",
              x: 0,
              y: 0,
              w: (plan.size[0] * 72) / 25.4,
              h: (plan.size[1] * 72) / 25.4,
              color: background,
            },
          ],
        }),
        defaultStyle: { font: "Lora" },
        content,
      },
      undefined,
      fonts,
      vfs,
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      try {
        output.getBlob(resolve);
      } catch (e) {
        reject(e);
      }
    });
    abort(signal);
    return blob;
  } finally {
    restoreIds.forEach((fn) => fn());
    if (selected) {
      selection?.removeAllRanges();
      selection?.addRange(selected);
    }
  }
}
