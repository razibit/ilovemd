import type { ExportOptions } from "@folio/engine";
export interface PageSlice {
  y: number;
  height: number;
  header?: { y: number; height: number };
}
export function planPages(
  height: number,
  capacity: number,
  boundaries: {
    top: number;
    bottom: number;
    heading?: boolean;
    break?: boolean;
  }[],
): PageSlice[] {
  if (!(height > 0 && capacity > 0))
    throw new Error("Invalid page dimensions.");
  const slices: PageSlice[] = [];
  let start = 0;
  while (start < height - 0.01) {
    let end = Math.min(height, start + capacity);
    const forced = boundaries
      .filter((b) => b.break && b.top > start + 1 && b.top < end)
      .sort((a, b) => a.top - b.top)[0];
    if (forced) end = forced.top;
    const crossing = boundaries
      .filter(
        (b) =>
          b.top > start + 1 &&
          b.top < end &&
          (b.bottom > end || (b.heading && b.bottom + 1 >= end)) &&
          b.bottom - b.top < capacity,
      )
      .sort((a, b) => a.top - b.top)[0];
    if (crossing) end = crossing.top;
    if (end <= start) throw new Error("Pagination did not advance.");
    slices.push({ y: start, height: end - start });
    start = end;
    if (slices.length > 200)
      throw new Error(
        "More than 200 pages. Split the document before exporting.",
      );
  }
  return slices;
}
export function measuredPages(article: HTMLElement, options: ExportOptions) {
  const sizes = {
    A4: [210, 297],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6],
  };
  const size = [...sizes[options.paper]];
  if (options.landscape) size.reverse();
  const width = parseFloat(getComputedStyle(article).width),
    printableWidth = ((size[0] - options.margin * 2) * 72) / 25.4,
    printableHeight = ((size[1] - options.margin * 2) * 72) / 25.4;
  if (printableWidth <= 0 || printableHeight <= 0)
    throw new Error("Margins leave no printable page area.");
  const scale = printableWidth / width,
    capacity = printableHeight / scale,
    origin = article.getBoundingClientRect();
  const boundaries = [
    ...article.querySelectorAll<HTMLElement>(
      "h1,h2,h3,h4,p,li,tr,pre,figure,.math-display,.folio-note,.diagram-container,.folio-pagebreak",
    ),
  ].map((el) => {
    const r = el.getBoundingClientRect(),
      heading = /^H[1-6]$/.test(el.tagName);
    const next = heading
      ? el.nextElementSibling?.getBoundingClientRect()
      : undefined;
    return {
      top: r.top - origin.top,
      bottom:
        heading && next
          ? Math.min(
              next.bottom - origin.top,
              next.top -
                origin.top +
                parseFloat(getComputedStyle(el.nextElementSibling!).lineHeight),
            )
          : r.bottom - origin.top,
      heading,
      break: el.classList.contains("folio-pagebreak"),
    };
  });
  // Line rectangles prevent splitting long paragraphs midway through glyphs.
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const r of range.getClientRects())
      if (r.height)
        boundaries.push({
          top: r.top - origin.top,
          bottom: r.bottom - origin.top,
          heading: false,
          break: false,
        });
  }
  const slices = planPages(
    parseFloat(getComputedStyle(article).height),
    capacity,
    boundaries,
  );
  const headers = [...article.querySelectorAll("table")].map((t) => ({
    table: t.getBoundingClientRect(),
    head: t.querySelector("thead")?.getBoundingClientRect(),
  }));
  // Repeated headers consume page space, so recompute the continuation slice.
  for (let i = 1; i < slices.length; i++) {
    const slice = slices[i];
    const table = headers.find(
      (t) =>
        t.head &&
        t.table.top - origin.top < slice.y &&
        t.table.bottom - origin.top > slice.y,
    );
    if (!table?.head) continue;
    const h = table.head.height;
    const rest = planPages(
      parseFloat(getComputedStyle(article).height) - slice.y,
      capacity - h,
      boundaries.map((b) => ({
        ...b,
        top: b.top - slice.y,
        bottom: b.bottom - slice.y,
      })),
    );
    slices.splice(
      i,
      slices.length - i,
      ...rest.map((r) => ({ ...r, y: r.y + slice.y })),
    );
    slices[i].header = { y: table.head.top - origin.top, height: h };
    if (slices.length > 200)
      throw new Error(
        "More than 200 pages. Split the document before exporting.",
      );
  }
  return { slices, scale, width, printableWidth, printableHeight, size };
}
