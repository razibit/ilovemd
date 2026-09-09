import { replaceEditor, openZoom, closeZoom, toggleAnnotations, expectNotesSaved } from "./helpers";
import { test, expect } from "@playwright/test";
import { defaultExportOptions } from "../../packages/engine/src/types";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

test("drawing, navigation, persistence, revisions and annotated exports", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# Annotation test\n\nKeep the drawing aligned with this paragraph.\n\n" +
      "More text on the page.\n\n".repeat(35),
  );
  await expect(page.locator("article h1")).toHaveText("Annotation test");
  await toggleAnnotations(page);
  const layer = page.locator(".annotation-layer");
  await expect(layer).toHaveClass(/drawing-enabled/);
  await openZoom(page);
  await page
    .getByRole("button", { name: "Reset preview zoom", exact: true })
    .click();
  await expect
    .poll(() => page.locator(".preview-scroll").evaluate((e) => e.scrollTop))
    .toBe(0);
  await closeZoom(page);
  let r = (await layer.boundingBox())!;
  await page.mouse.move(r.x + 70, r.y + 150);
  await page.mouse.down();
  await page.mouse.move(r.x + 180, r.y + 150, { steps: 12 });
  await page.mouse.up();
  await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(1);
  await expectNotesSaved(page);
  const path = await layer.locator("path").first().getAttribute("d");
  await openZoom(page);
  await page
    .getByRole("slider", { name: "Preview zoom", exact: true })
    .fill("180");
  await expect(page.getByLabel("Zoom percentage")).toHaveText("180%");
  await expect(layer.locator("path").first()).toHaveAttribute("d", path!);
  const slider = page.getByRole("slider", {
    name: "Preview zoom",
    exact: true,
  });
  await slider.hover();
  await page.mouse.wheel(0, -100);
  await expect(page.getByLabel("Zoom percentage")).toHaveText("185%");
  await page.locator(".preview-scroll").dispatchEvent("wheel", {
    ctrlKey: true,
    deltaY: -10,
    clientX: 1000,
    clientY: 400,
  });
  await expect
    .poll(async () =>
      parseInt((await page.getByLabel("Zoom percentage").textContent())!),
    )
    .toBeGreaterThan(185);
  await openZoom(page);
  await page
    .getByRole("button", { name: "Reset preview zoom", exact: true })
    .click();
  await openZoom(page);
  await page.getByRole("button", { name: "Pan page", exact: true }).click();
  await closeZoom(page);
  r = (await layer.boundingBox())!;
  await page.mouse.move(r.x + 100, r.y + 200);
  await page.mouse.down();
  await page.mouse.move(r.x + 100, r.y + 100, { steps: 5 });
  await page.mouse.up();
  await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(1);
  await openZoom(page);
  await page
    .getByRole("button", { name: "Reset preview zoom", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".annotation-layer path").first()).toHaveAttribute(
    "d",
    path!,
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Include annotations", exact: true })
    .check();
  await page.getByRole("button", { name: "Generate export preview" }).click();
  await expect(page.locator(".pdf-pages canvas").first()).toBeVisible({
    timeout: 45000,
  });
  await page.screenshot({ path: "output/playwright/annotated-pdf.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# Changed layout\n\nCompletely different text.",
  );
  await expect(page.locator(".annotation-notice")).toContainText(
    "earlier layout",
  );
  await expect(page.locator(".annotation-layer")).toHaveCount(0);
  await page.getByRole("button", { name: "Review preserved notes" }).click();
  await expect(page.getByRole("dialog")).toContainText("Annotation test");
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(errors).toEqual([]);
});

test("compact responsive workspace and annotation editing", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await page.getByRole("button", {name:"Light interface",exact:true}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# Shapes\n\nDraw here.",
  );
  await expect(page.locator("article h1")).toHaveText("Shapes");
  await toggleAnnotations(page);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const layer = page.locator(".annotation-layer");
  const r = (await layer.boundingBox())!;
  await page.mouse.move(r.x + 50, r.y + 180);
  await page.mouse.down();
  await page.mouse.move(r.x + 150, r.y + 230, { steps: 5 });
  await page.mouse.up();
  await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo note", exact: true }).click();
  await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo note", exact: true }).click();
  await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.mouse.click(r.x + 80, r.y + 200);
  await expect(
    page.getByRole("button", { name: "Delete selected" }),
  ).toBeEnabled();
  await layer.press("ArrowRight");
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo note" }).click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await openZoom(page);
    await page.getByRole("button", { name: "Fit width", exact: true }).click();
    await expect.poll(() => page.locator(".preview-scroll").evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator(".workspace-toolbar")).toHaveCount(1);
    await expect(page.locator(".document-toolbar,.view-toolbar")).toHaveCount(
      0,
    );
    expect(
      await page
        .locator(".app-header")
        .evaluate((e) => e.getBoundingClientRect().height),
    ).toBe(48);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/annotations-${width}.png`,
    });
  }
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations;
  await writeFile(
    "output/playwright/annotations-axe.json",
    JSON.stringify(violations, null, 2),
  );
  expect(violations).toEqual([]);
});

test("visual exports include exact vectors, selection crops and final-page notes", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# Export annotations\n\n" +
      "A paragraph for precise notes.\n\n".repeat(45),
  );
  await expect(page.locator("article h1")).toHaveText("Export annotations");
  await toggleAnnotations(page);
  await expectNotesSaved(page);
  const set = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("folio");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return await new Promise<any>((resolve, reject) => {
      const r = db
        .transaction("annotations")
        .objectStore("annotations")
        .getAll();
      r.onsuccess = () => {
        resolve(r.result[0]);
        db.close();
      };
      r.onerror = () => reject(r.error);
    });
  });
  const paragraph = await page
    .locator("article p")
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect(),
        a = el.closest("article")!.getBoundingClientRect();
      return {
        id: el.id,
        x: r.x - a.x,
        y: r.y - a.y,
        width: r.width,
        height: r.height,
      };
    });
  set.objects = [
    {
      id: "top",
      tool: "line",
      points: [
        { x: paragraph.x + 10, y: paragraph.y + 8 },
        { x: paragraph.x + 110, y: paragraph.y + 8 },
      ],
      color: "#ff0000",
      width: 4,
      opacity: 1,
    },
    {
      id: "bottom",
      tool: "rectangle",
      points: [
        { x: 60, y: set.layout.height - 70 },
        { x: 160, y: set.layout.height - 30 },
      ],
      color: "#ff0000",
      width: 4,
      opacity: 1,
    },
  ];
  const artifact = async (
    format: "png" | "html" | "pdf",
    extra: Record<string, unknown> = {},
  ) => {
    const response = await request.post("/api/exports", {
      data: {
        snapshot: set.snapshot,
        annotations: set,
        options: {
          ...defaultExportOptions,
          format,
          includeAnnotations: true,
          ...extra,
        },
      },
    });
    const info = await response.json();
    expect(response.ok(), JSON.stringify(info)).toBeTruthy();
    const download = await request.get(info.artifacts[0].url, {
      headers: { "X-Export-Token": info.token },
    });
    expect(download.ok()).toBeTruthy();
    const bytes = await download.body();
    await request.delete(`/api/exports/${info.id}`, {
      headers: { "X-Export-Token": info.token },
    });
    return bytes;
  };
  const redBounds = async (bytes: Buffer) => {
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = Infinity,
      minY = Infinity,
      maxY = 0,
      count = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        if (
          data[i] > 240 &&
          data[i + 1] < 20 &&
          data[i + 2] < 20 &&
          data[i + 3] > 200
        ) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          count++;
        }
      }
    return { minX, minY, maxY, count };
  };
  const png = await artifact("png");
  await writeFile("output/playwright/annotated-full.png", png);
  const pixels = await redBounds(png);
  expect(pixels.count).toBeGreaterThan(100);
  expect(Math.abs(pixels.minY - (paragraph.y + 6))).toBeLessThan(3);
  const clean = await artifact("png", { includeAnnotations: false });
  expect((await redBounds(clean)).count).toBe(0);
  const selection = await artifact("png", {
    pngMode: "selection",
    selection: paragraph.id,
  });
  expect((await redBounds(selection)).count).toBeGreaterThan(100);
  await writeFile("output/playwright/annotated-selection.png", selection);
  const html = (await artifact("html")).toString();
  expect(html).toContain('stroke="#ff0000"');
  expect(html).toContain(`width:${set.layout.width}px!important`);
  const pages = unzipSync(await artifact("png", { pngMode: "pages" }));
  const names = Object.keys(pages).sort();
  expect(names.length).toBeGreaterThan(1);
  expect(
    (await redBounds(Buffer.from(pages[names.at(-1)!]))).count,
  ).toBeGreaterThan(50);
  await writeFile(
    "output/playwright/annotated-last-page.png",
    pages[names.at(-1)!],
  );
  // The export payload did not mutate the saved editable set.
  await page.reload();
  await expect(page.locator(".annotation-layer > g")).toHaveCount(0);
});

test("toolbar follows deliberate scrolling and retains focused controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const p = page.locator(".preview-scroll"),
    toolbar = page.locator(".workspace-toolbar");
  await p.focus();
  await p.hover();
  await page.mouse.wheel(0, 350);
  await expect(toolbar).toHaveClass(/toolbar-hidden/);
  await page.mouse.wheel(0, 100);
  await expect(toolbar).toHaveClass(/toolbar-hidden/);
  await page.mouse.wheel(0, -80);
  await expect(toolbar).not.toHaveClass(/toolbar-hidden/);
  await page.getByLabel("More workspace controls").click();
  await p.hover();
  await page.mouse.wheel(0, 200);
  await expect(toolbar).not.toHaveClass(/toolbar-hidden/);
  await page.getByLabel("More workspace controls").press("Escape");
});

test("annotation save failures are visible and preserve editable backup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "annotations")
        throw new DOMException("Test quota exhausted", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await toggleAnnotations(page);
  await expect(page.locator(".annotation-notice")).toContainText(
    "QuotaExceededError",
  );
  await expect(page.locator(".unsaved-notice")).toContainText("Unsaved notes");
  await page.getByRole("button", { name: "Close annotation palette" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download notes backup" }).click();
  expect((await pending).suggestedFilename()).toBe("annotations.folio.json");
});

test("document isolation and competing annotation saves", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# Isolated notes\n\nOriginal document.",
  );
  await expect(page.locator("article h1")).toHaveText("Isolated notes");
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await toggleAnnotations(page);
  await expectNotesSaved(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".annotation-layer")).toHaveCount(1);
  await toggleAnnotations(other);
  for (const p of [page, other]) {
    const r = (await p.locator(".annotation-layer").boundingBox())!;
    await p.mouse.move(r.x + 60, r.y + 170);
    await p.mouse.down();
    await p.mouse.move(r.x + 150, r.y + 170, { steps: 5 });
    await p.mouse.up();
    if (p === page)
      await expectNotesSaved(p);
  }
  await expect(other.locator(".annotation-notice")).toContainText(
    "Another tab changed these notes",
  );
  await expect(other.locator(".annotation-layer path")).toHaveCount(1);
  // Refresh the document-head token changed when the second tab opened.
  await page.reload();
  await expect(page.locator(".annotation-layer")).toHaveCount(1);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "different.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Different document"),
    });
  await expect(page.locator("article h1")).toHaveText("Different document");
  await expect(page.locator(".annotation-layer")).toHaveCount(0);
});

test("version two browser storage upgrades without losing the document", async ({
  page,
}) => {
  await page.goto("/api/health");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("folio", 2);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("heads");
        r.result.createObjectStore("history", { keyPath: "key" });
        r.result.createObjectStore("assets");
        r.result.createObjectStore("preferences");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("heads", "readwrite");
      tx.objectStore("heads").put(
        {
          snapshot: {
            id: "legacy-document",
            revision: 2,
            source: "# Migrated document",
            assets: {},
            settings: { singleDollarMath: true, macros: {} },
          },
          version: "legacy-version",
          key: "legacy",
          at: Date.now(),
        },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toHaveText("Migrated document");
  await toggleAnnotations(page);
  await expectNotesSaved(page);
});

test.describe("high density annotation geometry", () => {
  test.use({ deviceScaleFactor: 2 });
  test("all drawing tools, resizing, temporary pan, and frozen columns", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditor(
      page.getByRole("textbox", { name: "Markdown source" }),
      "# Tool geometry\n\n:::columns\nLeft and right columns.\n\nMore text to arrange across columns.\n:::\n\nA final paragraph.\n\n" + "Anchor-test reading space.\n\n".repeat(20),
    );
    await expect(page.locator("article h1")).toHaveText("Tool geometry");
    await toggleAnnotations(page);
    const layer = page.locator(".annotation-layer");
    const r = (await layer.boundingBox())!;
    let count = 0;
    for (const tool of [
      "pen",
      "marker",
      "highlighter",
      "underline",
      "line",
      "arrow",
      "rectangle",
      "ellipse",
    ]) {
      await page.getByRole("button", { name: tool[0].toUpperCase() + tool.slice(1), exact: true }).click();
      await page.mouse.move(r.x + 60, r.y + 180 + count * 12);
      await page.mouse.down();
      await page.mouse.move(r.x + 160, r.y + 190 + count * 12, { steps: 8 });
      await page.mouse.up();
      count++;
      await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(
        count,
      );
    }
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.mouse.click(r.x + 110, r.y + 274);
    await expect(
      page.getByRole("button", { name: "Delete selected" }),
    ).toBeEnabled();
    const handle = layer.locator("[data-resize]");
    const b = (await handle.boundingBox())!;
    await page.mouse.move(b.x + 6, b.y + 6);
    await page.mouse.down();
    await page.mouse.move(b.x + 30, b.y + 25, { steps: 5 });
    await page.mouse.up();
    await layer.press("Escape");
    const width = await page
      .locator("article")
      .evaluate((e) => (e as HTMLElement).offsetWidth);
    const columns = await page
      .locator(".folio-columns")
      .evaluate((e) => getComputedStyle(e).columnCount);
    await openZoom(page);
    await page
      .getByRole("slider", { name: "Preview zoom", exact: true })
      .fill("175");
    const viewport = (await page.locator(".preview-scroll").boundingBox())!;
    const focal = {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    };
    const before = (await page.locator(".preview-surface").boundingBox())!;
    const docPoint = {
      x: (focal.x - before.x) / 1.75,
      y: (focal.y - before.y) / 1.75,
    };
    await page.locator(".preview-scroll").dispatchEvent("wheel", {
      ctrlKey: true,
      deltaY: -12,
      clientX: focal.x,
      clientY: focal.y,
    });
    await expect
      .poll(async () =>
        parseInt((await page.getByLabel("Zoom percentage").textContent())!),
      )
      .toBeGreaterThan(175);
    const after = (await page.locator(".preview-surface").boundingBox())!;
    const factor = after.width / width;
    expect(Math.abs(after.x + docPoint.x * factor - focal.x)).toBeLessThan(2);
    expect(Math.abs(after.y + docPoint.y * factor - focal.y)).toBeLessThan(2);
    await page.locator(".preview-scroll").hover();
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(1000, 400, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(8);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole("button", { name: "Preview", exact: true }).focus();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Fit width" }).click();
    expect(
      await page
        .locator("article")
        .evaluate((e) => (e as HTMLElement).offsetWidth),
    ).toBe(width);
    expect(
      await page
        .locator(".folio-columns")
        .evaluate((e) => getComputedStyle(e).columnCount),
    ).toBe(columns);
    await page.screenshot({
      path: "output/playwright/annotations-high-density.png",
    });
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Clear notes" }).click();
    await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(8);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear notes" }).click();
    await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo note" }).click();
    await expect(layer.locator(":scope > g[data-note-id]")).toHaveCount(8);
  });
});
