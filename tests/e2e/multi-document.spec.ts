import { test, expect, type Page } from "@playwright/test";
import { replaceEditor, toggleAnnotations, expectNotesSaved } from "./helpers";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
test("quota failures retain independent drafts through document switching and retry", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await rename(page, "Quota A");
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).simulateQuota = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "heads" && (window as any).simulateQuota) {
        this.transaction.abort();
        throw new DOMException("Simulated device quota", "QuotaExceededError");
      }
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  await source(page, "Unsaved quota A");
  await create(page, "Quota B");
  await source(page, "Unsaved quota B");
  await page.getByRole("button", { name: "Quota A", exact: true }).click();
  await expect(page.locator("article h1")).toHaveText("Unsaved quota A");
  await page.evaluate(() => {
    (window as any).simulateQuota = false;
  });
  await page.getByRole("button", { name: "Quota B", exact: true }).click();
  await expect(page.locator("article h1")).toHaveText("Unsaved quota B");
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await page.getByRole("button", { name: "Quota A", exact: true }).click();
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator("article h1")).toHaveText("Unsaved quota A");
  await page.getByRole("button", { name: "Quota B", exact: true }).click();
  await expect(page.locator("article h1")).toHaveText("Unsaved quota B");
});
async function rename(page: Page, name: string) {
  page.once("dialog", (d) => d.accept(name));
  await page.getByRole("button", { name: "Rename", exact: true }).click();
}

test("a late renderer response cannot replace the selected document or its outline", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as any).Worker = function (
      url: string | URL,
      options?: WorkerOptions,
    ) {
      const native = new NativeWorker(url, options);
      const delayed = new Set<string>();
      return new Proxy(native, {
        get(target, property) {
          if (property === "postMessage")
            return (message: any) => {
              if (message.snapshot?.source.includes("SLOW_WORKER_A")) {
                delayed.add(message.requestKey);
                (window as any).slowRequested = true;
              }
              target.postMessage(message);
            };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, property, callback) {
          if (property === "onmessage" && typeof callback === "function") {
            target.onmessage = (event) => {
              if (delayed.has(event.data.requestKey))
                setTimeout(() => {
                  callback(event);
                  (window as any).lateDelivered = true;
                }, 800);
              else callback(event);
            };
            return true;
          }
          return Reflect.set(target, property, callback, target);
        },
      });
    };
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# SLOW_WORKER_A",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).slowRequested))
    .toBe(true);
  await create(page, "Fast document B");
  await source(page, "Fast document B");
  await expect
    .poll(() => page.evaluate(() => (window as any).lateDelivered))
    .toBe(true);
  await expect(page.locator("article h1")).toHaveText("Fast document B");
  await expect(
    page.getByRole("navigation", { name: "Document outline" }),
  ).toContainText("Fast document B");
  await expect(
    page.getByRole("navigation", { name: "Document outline" }),
  ).not.toContainText("SLOW_WORKER_A");
  await source(page, "Fast document B edited after late completion");
});
test("deleting the last document creates a blank document and rejects stale-tab resurrection", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await rename(page, "Only document");
  await source(page, "Only document");
  await draw(page, 60);
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  const oldId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("folio");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction(["workspace", "assets"], "readwrite");
    tx.objectStore("assets").put("retained shared asset", "shared-proof");
    const id = await new Promise<string>((resolve) => {
      const r = tx.objectStore("workspace").get("active");
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return id;
  });
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator("article h1")).toHaveText("Only document");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Only document");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".document-title")).toHaveText("Untitled document");
  await expect(page.locator("article h1")).toHaveCount(0);
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await replaceEditor(
    other.getByRole("textbox", { name: "Markdown source" }),
    "# Retained stale draft",
  );
  await expect(
    other.getByRole("status").filter({ hasText: "deleted" }),
  ).toBeVisible();
  const stored = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("folio");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction(["heads", "documents", "annotations", "assets"]);
    const read = (r: IDBRequest) =>
      new Promise<any>((resolve) => {
        r.onsuccess = () => resolve(r.result);
      });
    const [head, documents, notes, asset] = await Promise.all([
      read(tx.objectStore("heads").get(id)),
      read(tx.objectStore("documents").count()),
      read(tx.objectStore("annotations").index("documentId").getAll(id)),
      read(tx.objectStore("assets").get("shared-proof")),
    ]);
    db.close();
    return { head, documents, notes, asset };
  }, oldId);
  expect(stored).toEqual({
    head: undefined,
    documents: 1,
    notes: [],
    asset: "retained shared asset",
  });
  await page.reload();
  await expect(page.locator(".document-title")).toHaveText("Untitled document");
});
async function create(page: Page, name: string) {
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.getByRole("button", { name: /Blank document A fresh/ }).click();
  await rename(page, name);
}
async function source(page: Page, name: string) {
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    `# ${name}\n\n## ${name} outline\n\nOnly ${name} owns this paragraph.`,
  );
  await expect(page.locator("article h1")).toHaveText(name);
}
async function draw(page: Page, x: number) {
  await expect(
    page.getByRole("button", { name: "Annotate", exact: true }),
  ).toBeEnabled();
  await toggleAnnotations(page);
  await page.locator(".preview-scroll").evaluate((e) => (e.scrollTop = 0));
  const r = (await page.locator(".annotation-layer").boundingBox())!;
  await page.mouse.move(r.x + x, r.y + 160);
  await page.mouse.down();
  await page.mouse.move(r.x + x + 45, r.y + 165, { steps: 6 });
  await page.mouse.up();
  await expectNotesSaved(page);
}
async function download(page: Page, format: "pdf" | "png" | "html") {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("button", {
      name:
        format === "pdf"
          ? "PDF Print & share"
          : format === "png"
            ? "PNG Capture & present"
            : "HTML Publish & archive",
    })
    .click();
  await page
    .getByRole("checkbox", { name: "Include annotations", exact: true })
    .check();
  await page
    .getByRole("button", { name: /Generate export preview|Retry export/ })
    .click();
  const button = page.getByRole("button", {
    name: `Download document.${format}`,
    exact: true,
  });
  await expect(button).toBeVisible({ timeout: 60000 });
  const promise = page.waitForEvent("download");
  await button.click();
  const file = await promise;
  const bytes = await readFile((await file.path())!);
  await page.getByRole("button", { name: "Close dialog" }).click();
  return bytes;
}
test("five documents isolate source, title, notes, outline, settings and operations", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  const paths: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i) await create(page, `Document ${i}`);
    else await rename(page, "Document 0");
    expect(
      await page
        .locator("article")
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe("16px");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("slider", { name: "Font size", exact: true })
      .fill(String(15 + i));
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    if (i % 2)
      await page
        .getByRole("button", { name: "Toggle document theme", exact: true })
        .click();
    await source(page, `Unique ${i}`);
    await draw(page, 50 + i * 12);
    paths.push(
      (await page.locator(".annotation-layer path").first().getAttribute("d"))!,
    );
  }
  for (const i of [0, 4, 2, 1, 3, 2, 0, 4, 2]) {
    await page
      .getByRole("button", { name: `Document ${i}`, exact: true })
      .click();
    await expect(page.locator("article h1")).toHaveText(`Unique ${i}`);
    await expect(page.locator("article")).toHaveAttribute(
      "data-theme",
      i % 2 ? "dark" : "light",
    );
    expect(
      await page
        .locator("article")
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe(`${15 + i}px`);
    await expect(
      page.getByRole("navigation", { name: "Document outline" }),
    ).toContainText(`Unique ${i} outline`);
    await expect(
      page.locator(".annotation-layer path").first(),
    ).toHaveAttribute("d", paths[i]);
  }
  const html = (await download(page, "html")).toString();
  expect(html).toContain("Only Unique 2");
  expect(html).not.toContain("Only Unique 1");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Document 2 copy", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".annotation-layer path").first()).toHaveAttribute(
    "d",
    paths[2],
  );
  await rename(page, "Renamed copy");
  await source(page, "Copy edited independently");
  await page.getByRole("button", { name: "Document 2", exact: true }).click();
  await expect(page.locator("article h1")).toHaveText("Unique 2");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Renamed copy", exact: true }),
  ).toBeVisible();
  await expect(page.locator("article h1")).toHaveText("Unique 2");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Document 2", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("article h1")).toHaveText("Unique 0");
  // The switch happens before the debounce; the edited outgoing draft still survives.
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# Pending outgoing edit",
  );
  await page.getByRole("button", { name: "Document 4", exact: true }).click();
  await expect(page.locator("article h1")).toHaveText("Unique 4");
  await page.getByRole("button", { name: "Document 0", exact: true }).click();
  await expect(page.locator("article h1")).toHaveText("Pending outgoing edit");
  await page.reload();
  await expect(page.locator("article h1")).toHaveText("Pending outgoing edit");
  expect(errors).toEqual([]);
});

test("legacy migration recovers historical IDs and orphaned notes atomically", async ({
  page,
}) => {
  await page.route("**/seed", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Migration seed</title>",
    }),
  );
  await page.goto("/seed");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("folio", 3);
      r.onupgradeneeded = () => {
        for (const name of ["heads", "assets", "preferences"])
          r.result.createObjectStore(name);
        r.result.createObjectStore("history", { keyPath: "key" });
        r.result.createObjectStore("annotations", { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const snapshot = (id: string) => ({
      id,
      revision: 1,
      source: `# Legacy ${id}`,
      settings: { singleDollarMath: true, macros: {} },
      assets: {},
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(
        ["heads", "history", "annotations"],
        "readwrite",
      );
      tx.objectStore("heads").put(
        { snapshot: snapshot("a"), version: "a", key: "a", at: 10 },
        "current",
      );
      tx.objectStore("history").put({
        snapshot: snapshot("b"),
        version: "b",
        key: "b",
        at: 9,
      });
      tx.objectStore("history").put({ snapshot: null, key: "damaged", at: 8 });
      tx.objectStore("history").put({
        snapshot: { ...snapshot("b"), source: "# Older b" },
        version: "older",
        key: "older-b",
        at: 1,
      });
      tx.objectStore("annotations").put({
        schema: 1,
        id: "notes-c-old",
        documentId: "c",
        revision: 0,
        version: "old-c",
        snapshot: { ...snapshot("c"), source: "# Older orphan c" },
        updatedAt: 1,
        layout: {
          width: 500,
          height: 400,
          fontSize: 16,
          lineHeight: 1.8,
          padding: [35, 38, 45, 38],
          theme: "light",
        },
        objects: [],
      });
      tx.objectStore("annotations").put({
        schema: 1,
        id: "notes-c",
        documentId: "c",
        revision: 1,
        version: "c",
        updatedAt: 10,
        snapshot: snapshot("c"),
        layout: {
          width: 500,
          height: 400,
          fontSize: 16,
          lineHeight: 1.8,
          padding: [35, 38, 45, 38],
          theme: "light",
        },
        objects: [],
      });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  // An interrupted schema transaction must leave the legacy store intact, so
  // the production upgrader can retry safely on the next open.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("folio", 4);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("interrupted");
        request.transaction!.abort();
      };
      request.onerror = () => resolve();
      request.onsuccess = () => {
        request.result.close();
        reject(new Error("Upgrade should have aborted"));
      };
    });
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("folio", 3);
      request.onsuccess = () => resolve(request.result);
    });
    if (db.objectStoreNames.contains("interrupted"))
      throw new Error("Partial migration survived");
    db.close();
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toHaveText("Legacy a");
  for (const id of ["b", "c"]) {
    await page
      .getByRole("button", { name: `Legacy ${id}`, exact: true })
      .click();
    await expect(page.locator("article h1")).toHaveText(`Legacy ${id}`);
  }
  await page.reload();
  await expect(page.locator("article h1")).toHaveText("Legacy c");
  expect(
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const q = indexedDB.open("folio");
        q.onsuccess = () => resolve(q.result);
      });
      const result = await new Promise<any>((resolve) => {
        const q = db.transaction("documents").objectStore("documents").get("b");
        q.onsuccess = () => resolve(q.result);
      });
      db.close();
      return result.createdAt;
    }),
  ).toBe(1);
  expect(
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((r) => {
        const q = indexedDB.open("folio");
        q.onsuccess = () => r(q.result);
      });
      const value = await new Promise<any>((r) => {
        const q = db
          .transaction("history")
          .objectStore("history")
          .get("damaged");
        q.onsuccess = () => r(q.result);
      });
      db.close();
      return value?.key;
    }),
  ).toBe("damaged");
});

test("1000 documents mount only visible rows and one editor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("folio");
      q.onsuccess = () => r(q.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["documents", "heads"], "readwrite");
      for (let i = 0; i < 1000; i++) {
        const id = `large-${i}`;
        tx.objectStore("documents").put({
          id,
          title: `Large ${i}`,
          createdAt: i,
          updatedAt: i,
          session: {},
        });
        tx.objectStore("heads").put(
          {
            snapshot: {
              id,
              revision: 0,
              source: `# Large ${i}`,
              settings: { singleDollarMath: true, macros: {} },
              assets: {},
            },
            version: id,
            key: id,
            at: i,
          },
          id,
        );
      }
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await page.locator(".workspace-documents").evaluate((e) => {
    e.scrollTop = 0;
  });
  await expect(
    page.getByRole("button", { name: "Large 0", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator(".workspace-documents .document-item").count(),
  ).toBeLessThan(20);
  await page
    .locator(".workspace-documents")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.getByRole("button", { name: "Large 999", exact: true }).click();
  await expect(page.locator("article h1")).toHaveText("Large 999");
  await expect(page.locator(".cm-editor")).toHaveCount(1);
  await expect(page.locator(".preview-surface")).toHaveCount(1);
});

test("PDF, scaled PNG and independently scrolling HTML preserve document coordinates", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const api: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    "# Shared surface fixture\n\nA paragraph with **bold**, *italics* and a [link](https://example.com).\n\n" +
      Array.from(
        { length: 42 },
        (_, i) =>
          `## Heading ${i}\n\nParagraph ${i} has text beneath its annotations, with enough content to cover several printed pages.\n\n`,
      ).join("") +
      "FINAL_SHARED_SURFACE_MARKER",
  );
  await expect(page.locator("article h1")).toHaveText("Shared surface fixture");
  await draw(page, 90);
  const png = await download(page, "png");
  const metadata = await sharp(png).metadata();
  expect(metadata.width).toBe(
    await page
      .locator("article")
      .evaluate((e) => (e as HTMLElement).offsetWidth),
  );
  await writeFile("output/playwright/shared-surface.png", png);
  const html = (await download(page, "html")).toString();
  for (const url of html.matchAll(/url\(["']?([^"')]+)["']?\)/g))
    expect(url[1]).toMatch(/^(data:|#)/);
  await writeFile("output/playwright/shared-surface.html", html);
  const blocks = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("folio");
      request.onsuccess = () => resolve(request.result);
    });
    const sets = await new Promise<any[]>((resolve) => {
      const request = db
        .transaction("annotations")
        .objectStore("annotations")
        .getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return sets[0].blocks;
  });
  const independent = await context.newPage();
  const requests: string[] = [];
  independent.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await independent.setContent(html);
  await independent.evaluate(() => document.fonts.ready);
  const geometryError = () =>
    independent.locator("article").evaluate((article, blocks: any[]) => {
      const origin = article.getBoundingClientRect();
      return Math.max(
        ...blocks.map((block) => {
          const element = article.querySelector(`#${CSS.escape(block.id)}`);
          if (!element) return Infinity;
          const rect = element.getBoundingClientRect();
          return Math.max(
            Math.abs(rect.x - origin.x - block.x),
            Math.abs(rect.y - origin.y - block.y),
            Math.abs(rect.width - block.width),
            Math.abs(rect.height - block.height),
          );
        }),
      );
    }, blocks);
  expect(await geometryError()).toBeLessThanOrEqual(1);
  const before = await independent
    .locator(".document-surface > svg")
    .evaluate((e) => {
      const a = e
          .parentElement!.querySelector("article")!
          .getBoundingClientRect(),
        r = e.getBoundingClientRect();
      return { x: r.x - a.x, y: r.y - a.y, width: r.width };
    });
  expect(before.x).toBe(0);
  expect(before.y).toBe(0);
  await independent.evaluate(() => window.scrollTo(0, 500));
  await independent.setViewportSize({ width: 900, height: 700 });
  const after = await independent
    .locator(".document-surface > svg")
    .evaluate((e) => {
      const a = e
          .parentElement!.querySelector("article")!
          .getBoundingClientRect(),
        r = e.getBoundingClientRect();
      return { x: r.x - a.x, y: r.y - a.y, width: r.width };
    });
  expect(after).toEqual(before);
  expect(await geometryError()).toBeLessThanOrEqual(1);
  expect(requests).toEqual([]);
  await independent.close();
  const pdf = await download(page, "pdf");
  await writeFile("output/playwright/shared-surface.pdf", pdf);
  execFileSync("pdftotext", [
    "-layout",
    "output/playwright/shared-surface.pdf",
    "output/playwright/shared-surface.txt",
  ]);
  const pages = (await readFile("output/playwright/shared-surface.txt", "utf8"))
    .split("\f")
    .filter((p) => p.trim());
  expect(pages.length).toBeGreaterThan(2);
  expect(pages.every((p) => p.length > 40)).toBe(true);
  expect(pages.join("")).toContain("FINAL_SHARED_SURFACE_MARKER");
  expect(api).toEqual([]);
});

test.describe("zoom and device density", () => {
  for (const density of [1, 2])
    test.describe(`DPR ${density}`, () => {
      test.use({ deviceScaleFactor: density });
      test("pointer CTM and PNG resolution preserve coordinates at every preview zoom", async ({
        page,
      }) => {
        test.setTimeout(150000);
        await page.goto("/");
        await expect(page.locator("article h1")).toBeVisible();
        await source(page, "Zoom geometry");
        await draw(page, 70);
        await page.getByRole("button", { name: "Line", exact: true }).click();
        const layer = page.locator(".annotation-layer");
        const bounds = await layer.evaluate((e) => ({
          width: Number(e.getAttribute("width")),
          height: Number(e.getAttribute("height")),
        }));
        for (const zoom of [50, 100, 175, 250]) {
          await page.locator(".zoom-button").click();
          await page
            .getByRole("slider", { name: "Preview zoom", exact: true })
            .fill(String(zoom));
          await page.locator(".zoom-button").click();
          await page.locator(".preview-scroll").evaluate((e) => {
            e.scrollTop = 0;
            e.scrollLeft = 0;
          });
          const points = await layer.evaluate((e) => {
            const m = (e as SVGSVGElement).getScreenCTM()!;
            return [
              new DOMPoint(70, 120).matrixTransform(m),
              new DOMPoint(135, 120).matrixTransform(m),
            ].map((p) => ({ x: p.x, y: p.y }));
          });
          await page.mouse.move(points[0].x, points[0].y);
          await page.mouse.down();
          await page.mouse.move(points[1].x, points[1].y);
          await page.mouse.up();
          const line = layer.locator("g[data-note-id] path").last();
          await expect(line).toHaveAttribute("d", /^M/);
          const coords = (await line.getAttribute("d"))!
            .match(/-?\d+(?:\.\d+)?/g)!
            .map(Number);
          expect(Math.abs(coords[0] - 70)).toBeLessThan(1);
          expect(Math.abs(coords.at(-2)! - 135)).toBeLessThan(1);
        }
        await expectNotesSaved(page);
        let previous: Buffer | undefined;
        for (const scale of [1, 2, 3]) {
          await page
            .getByRole("button", { name: "Export", exact: true })
            .click();
          await page
            .getByRole("button", { name: "PNG Capture & present" })
            .click();
          await page
            .getByRole("checkbox", { name: "Include annotations", exact: true })
            .check();
          await page
            .getByRole("spinbutton", { name: "Scale", exact: true })
            .fill(String(scale));
          await page
            .getByRole("button", {
              name: /Generate export preview|Retry export/,
            })
            .click();
          const button = page.getByRole("button", {
            name: "Download document.png",
            exact: true,
          });
          await expect(button).toBeVisible({ timeout: 60000 });
          const pending = page.waitForEvent("download");
          await button.click();
          const file = await pending;
          const bytes = await readFile((await file.path())!);
          const meta = await sharp(bytes).metadata();
          expect(Math.abs(meta.width! / scale - bounds.width)).toBeLessThan(1);
          expect(Math.abs(meta.height! / scale - bounds.height)).toBeLessThan(
            1,
          );
          const rowBytes = await sharp(bytes)
            .extract({
              left: Math.round(70 * scale),
              top: Math.round(119 * scale),
              width: Math.round(65 * scale),
              height: Math.max(1, Math.round(3 * scale)),
            })
            .toBuffer();
          const row = await sharp(rowBytes).stats();
          expect(row.channels[0].mean).toBeGreaterThan(
            row.channels[1].mean + 50,
          );
          previous = bytes;
          await page.getByRole("button", { name: "Close dialog" }).click();
        }
        expect(previous).toBeDefined();
        await page.setViewportSize({ width: 390, height: 900 });
        expect(await layer.getAttribute("width")).toBe(String(bounds.width));
      });
    });
});

test("rich multi-page content, images and every annotation tool share the same clean and annotated PDF layout", async ({
  page,
}) => {
  test.setTimeout(180000);
  const { zipSync, strToU8 } = await import("fflate");
  const image = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#2563eb" },
  })
    .png()
    .toBuffer();
  const markdown =
    '# Complete annotation fixture\n\nLong paragraph with a [link](https://example.com), **bold text**, *italics* and underline target.\n\n- List first\n- List second\n\n```typescript\nconst quality = "sharp searchable code";\n```\n\n| Heading | Value |\n| --- | --- |\n| Table row | 42 |\n\n![Local image](assets/fixture.png)\n\n::pagebreak\n\n' +
    Array.from(
      { length: 25 },
      (_, i) =>
        `## Section ${i}\n\n${"Long paragraphs retain their typography and content underneath document-relative drawings. ".repeat(5)}\n\n`,
    ).join("") +
    "FINAL_COMPLETE_FIXTURE";
  const zip = zipSync({
    "document.md": strToU8(markdown),
    "manifest.json": strToU8(
      JSON.stringify({
        settings: { singleDollarMath: true, macros: {} },
        assets: [
          {
            path: "assets/fixture.png",
            file: "assets/fixture.png",
            name: "fixture.png",
            mime: "image/png",
          },
        ],
      }),
    ),
    "assets/fixture.png": image,
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "fixture.folio.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await expect(page.locator("article h1")).toHaveText(
    "Complete annotation fixture",
  );
  await expect(page.locator("article img")).toBeVisible();
  await draw(page, 60);
  // Save an adversarial document-coordinate fixture through the existing browser
  // store, then use only the production UI/exporter to create artifacts.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("folio");
      r.onsuccess = () => resolve(r.result);
    });
    const sets = await new Promise<any[]>((resolve) => {
      const r = db
        .transaction("annotations")
        .objectStore("annotations")
        .getAll();
      r.onsuccess = () => resolve(r.result);
    });
    const set = sets.at(-1),
      h = set.layout.height,
      w = set.layout.width;
    const tools = [
      "pen",
      "marker",
      "highlighter",
      "underline",
      "line",
      "arrow",
      "rectangle",
      "ellipse",
    ];
    set.objects = tools.map((tool, i) => ({
      id: `fixture-${i}`,
      tool,
      color: ["#ff0000", "#2563eb", "#eab308", "#15803d"][i % 4],
      width: [2, 4, 18, 3][i % 4],
      opacity: tool === "highlighter" ? 0.3 : 1,
      points: [
        {
          x: i === 7 ? w - 40 : 45 + i * 8,
          y: i === 0 ? 20 : i === 7 ? h - 75 : ((h - 200) * i) / 7 + 50,
        },
        {
          x: i === 7 ? w - 10 : 160 + i * 8,
          y: i === 0 ? 25 : i === 7 ? h - 20 : ((h - 200) * i) / 7 + 90,
        },
      ],
    }));
    const origin = document.querySelector("article")!.getBoundingClientRect();
    const image = document
      .querySelector("article img")!
      .getBoundingClientRect();
    const boundary =
      document.querySelector(".folio-pagebreak")!.getBoundingClientRect().top -
      origin.top;
    set.objects.push({
      id: "image-edge",
      tool: "rectangle",
      color: "#7c3aed",
      width: 3,
      opacity: 0.65,
      points: [
        { x: image.left - origin.left - 4, y: image.top - origin.top - 4 },
        { x: image.right - origin.left + 4, y: image.bottom - origin.top + 4 },
      ],
    });
    set.objects.push({
      id: "page-crossing",
      tool: "line",
      color: "#ff0000",
      width: 4,
      opacity: 1,
      points: [
        { x: 190, y: boundary - 12 },
        { x: 220, y: boundary + 12 },
      ],
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("annotations", "readwrite");
      tx.objectStore("annotations").put(set);
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator(".annotation-layer > g[data-note-id]")).toHaveCount(
    10,
  );
  const annotated = await download(page, "pdf");
  await writeFile("output/playwright/complete-annotated.pdf", annotated);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Include annotations", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: /Generate export preview|Retry export/ })
    .click();
  const cleanButton = page.getByRole("button", {
    name: "Download document.pdf",
    exact: true,
  });
  await expect(cleanButton).toBeVisible({ timeout: 60000 });
  const pending = page.waitForEvent("download");
  await cleanButton.click();
  const clean = await pending;
  await clean.saveAs("output/playwright/complete-clean.pdf");
  for (const name of ["complete-clean", "complete-annotated"]) {
    execFileSync("pdftotext", [
      "-layout",
      `output/playwright/${name}.pdf`,
      `output/playwright/${name}.txt`,
    ]);
  }
  const cleanText = await readFile(
      "output/playwright/complete-clean.txt",
      "utf8",
    ),
    annotatedText = await readFile(
      "output/playwright/complete-annotated.txt",
      "utf8",
    );
  expect(annotatedText).toBe(cleanText);
  const pages = cleanText.split("\f").filter((s) => s.trim());
  expect(pages.length).toBeGreaterThan(2);
  expect(pages.every((s) => s.length > 50)).toBe(true);
  expect(cleanText).toContain("sharp searchable code");
  expect(cleanText).toContain("FINAL_COMPLETE_FIXTURE");
  expect(annotated.toString("latin1")).toContain("/URI");
  for (const suffix of ["clean", "annotated"])
    execFileSync("pdftoppm", [
      "-f",
      "1",
      "-singlefile",
      "-scale-to",
      "1200",
      "-png",
      `output/playwright/complete-${suffix}.pdf`,
      `output/playwright/complete-${suffix}`,
    ]);
  const a = await sharp("output/playwright/complete-clean.png")
      .ensureAlpha()
      .raw()
      .toBuffer(),
    b = await sharp("output/playwright/complete-annotated.png")
      .ensureAlpha()
      .raw()
      .toBuffer();
  let unchanged = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) unchanged++;
  expect(unchanged / a.length).toBeGreaterThan(0.98);
});
