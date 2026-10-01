import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const longTitle =
  "Seller Acquisition and Seller-Center Design Research for Denzo — international marketplace notes";
const selector = (page: Page) =>
  page.getByRole("button", { name: "Active document", exact: true });
const actions = (page: Page) =>
  page.getByRole("button", { name: "Document actions", exact: true });
const sidebar = (page: Page) =>
  page.getByRole("navigation", { name: "Workspace documents" });

// These records live in a fresh Playwright context, never in the user's browser.
async function seed(page: Page, count: number) {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  // Stop the live app before replacing records. Its pending scroll/session
  // saves must not race fixture setup and reinsert the welcome document.
  await page.route("**/workspace-navigation-seed", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Workspace test seed</title>",
    }),
  );
  await page.goto("/workspace-navigation-seed");
  await page.evaluate(
    async ({ count, longTitle }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("folio");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            ["documents", "heads", "workspace"],
            "readwrite",
          );
          tx.objectStore("documents").clear();
          tx.objectStore("heads").clear();
          for (let i = 0; i < count; i++) {
            const id = `navigation-${i}`;
            const title =
              i === 0
                ? longTitle
                : i === 1
                  ? "A"
                  : `Research document ${String(i).padStart(4, "0")}`;
            tx.objectStore("documents").put({
              id,
              title,
              createdAt: i,
              updatedAt: i,
              session: {},
            });
            tx.objectStore("heads").put(
              {
                snapshot: {
                  id,
                  revision: 0,
                  source: `# Content ${i}\n\n## Outline ${i}\n\nIndependent paragraph ${i}.`,
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
          tx.objectStore("workspace").put("navigation-0", "active");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    { count, longTitle },
  );
  await page.goto("/");
  await expect(page.locator("article h1")).toHaveText("Content 0");
}

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Show outline", exact: true });
  if (await show.isVisible()) await show.click();
  await expect(sidebar(page)).toBeVisible();
}

test("header actions rename/delete only the selected document, including the last document", async ({
  page,
}) => {
  await seed(page, 2);
  await expect(
    page.locator(".compact-workspace,.workspace-document-actions"),
  ).toHaveCount(0);
  await actions(page).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Rename", "Delete"]);
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("prompt");
    await dialog.accept("Renamed selected document");
  });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await expect(selector(page)).toContainText("Renamed selected document");
  await expect(
    sidebar(page).getByRole("button", { name: "A", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(selector(page)).toContainText("Renamed selected document");
  await actions(page).click();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain('"Renamed selected document"');
    await dialog.dismiss();
  });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(selector(page)).toContainText("Renamed selected document");
  await actions(page).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(selector(page)).toContainText("A");
  await expect(page.locator("article h1")).toHaveText("Content 1");
  await expect(sidebar(page).getByRole("button")).toHaveCount(1);
  await actions(page).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(selector(page)).toContainText("Untitled document");
  await expect(sidebar(page).getByRole("button")).toHaveCount(1);
  await page.reload();
  await expect(selector(page)).toContainText("Untitled document");
});

test("readable rows and header fit in both themes from desktop through 320px", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await seed(page, 12);
  for (const width of [1440, 1100, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 672 : 844 });
    await showSidebar(page);
    for (const theme of ["Light", "Dark"]) {
      await page
        .getByRole("button", { name: `${theme} interface`, exact: true })
        .click();
      const header = page.locator(".app-header");
      const headerBox = (await header.boundingBox())!;
      const nameBox = (await page.locator(".workspace-name").boundingBox())!;
      const selectorBox = (await selector(page).boundingBox())!;
      expect(selectorBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
      expect(
        Math.abs(
          selectorBox.y +
            selectorBox.height / 2 -
            nameBox.y -
            nameBox.height / 2,
        ),
      ).toBeLessThan(1);
      expect(selectorBox.x + selectorBox.width).toBeLessThanOrEqual(width - 8);
      expect(await header.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
        true,
      );
      const row = sidebar(page).getByRole("button", {
        name: longTitle,
        exact: true,
      });
      await expect(row).toHaveAttribute("title", longTitle);
      await expect(row).toHaveAttribute("aria-current", "page");
      const geometry = await row.evaluate((e) => {
        const title = e.querySelector(".document-item-title")!;
        const text = title.getBoundingClientRect(),
          row = e.getBoundingClientRect(),
          list = e.closest(".workspace-documents")!.getBoundingClientRect();
        return {
          textTop: text.top,
          textBottom: text.bottom,
          rowTop: row.top,
          rowBottom: row.bottom,
          listTop: list.top,
          listBottom: list.bottom,
          overflow: getComputedStyle(title).textOverflow,
          lineHeight: getComputedStyle(title).lineHeight,
        };
      });
      expect(geometry.textTop).toBeGreaterThan(geometry.rowTop);
      expect(geometry.textBottom).toBeLessThan(geometry.rowBottom);
      expect(geometry.rowTop).toBeGreaterThanOrEqual(geometry.listTop);
      expect(geometry.rowBottom).toBeLessThanOrEqual(geometry.listBottom);
      expect(geometry.overflow).toBe("ellipsis");
      expect(parseFloat(geometry.lineHeight)).toBeGreaterThan(16);
      expect(await sidebar(page).evaluate((e) => e.clientHeight % 44)).toBe(0);
      if (width <= 900) {
        const asideBox = (await page.locator(".sidebar").boundingBox())!;
        const toolbarBox = (await page
          .locator(".workspace-toolbar")
          .boundingBox())!;
        expect(asideBox.y).toBeCloseTo(toolbarBox.y + toolbarBox.height, 0);
      }
      await page.screenshot({
        path: info.outputPath(`workspace-${width}-${theme.toLowerCase()}.png`),
      });
      await selector(page).click();
      const picker = page.getByRole("dialog", { name: "Switch document" });
      const box = (await picker.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
      await expect(
        page.getByRole("option", { name: longTitle, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.screenshot({
        path: info.outputPath(`picker-${width}-${theme.toLowerCase()}.png`),
      });
      await page.getByRole("option", { name: "A", exact: true }).click();
      await expect(page.locator("article h1")).toHaveText("Content 1");
      await expect(
        page.getByRole("navigation", { name: "Document outline" }),
      ).toContainText("Outline 1");
      await expect(
        page.getByRole("navigation", { name: "Document outline" }),
      ).not.toContainText("Outline 0");
      expect((await header.boundingBox())!.height).toBe(headerBox.height);
      await selector(page).click();
      await page.getByRole("option", { name: longTitle, exact: true }).click();
      await expect(page.locator("article h1")).toHaveText("Content 0");
    }
  }
});

test("1000 documents retain virtualization, search and keyboard focus across switches", async ({
  page,
}) => {
  await seed(page, 1000);
  expect(await sidebar(page).getByRole("button").count()).toBeLessThan(20);
  await sidebar(page)
    .getByRole("button", { name: longTitle, exact: true })
    .press("End");
  const last = sidebar(page).getByRole("button", {
    name: "Research document 0999",
    exact: true,
  });
  await expect(last).toBeFocused();
  await expect(page.locator("article h1")).toHaveText("Content 999");
  await last.press("ArrowUp");
  await expect(
    sidebar(page).getByRole("button", {
      name: "Research document 0998",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    sidebar(page).getByRole("button", { name: longTitle, exact: true }),
  ).toBeFocused();
  await selector(page).press("ArrowDown");
  const search = page.getByRole("combobox", { name: "Search documents" });
  await expect(search).toBeFocused();
  await search.press("End");
  await expect(
    page.getByRole("option", { name: "Research document 0999", exact: true }),
  ).toBeVisible();
  expect(await page.getByRole("option").count()).toBeLessThan(20);
  await search.press("Enter");
  await expect(selector(page)).toBeFocused();
  await expect(page.locator("article h1")).toHaveText("Content 999");
  await selector(page).click();
  await page.getByRole("listbox", { name: "Documents" }).evaluate((e) => {
    e.scrollTop = 0;
  });
  // Scrolling must not unmount the option referenced by the search field.
  expect(
    await search.evaluate(
      (e) =>
        !!document.getElementById(e.getAttribute("aria-activedescendant")!),
    ),
  ).toBe(true);
  await search.fill("document 0420");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.press("Enter");
  await expect(page.locator("article h1")).toHaveText("Content 420");
  await selector(page).click();
  await search.fill("no such document exists");
  await expect(
    page.getByRole("status").filter({ hasText: "No documents found" }),
  ).toBeVisible();
  await search.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Switch document" }),
  ).toBeVisible();
  await search.press("Escape");
  await expect(selector(page)).toBeFocused();
  await page.reload();
  await expect(page.locator("article h1")).toHaveText("Content 420");
  await expect(page.locator(".cm-editor,.preview-surface")).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 500 });
  const current = sidebar(page).getByRole("button", {
    name: "Research document 0420",
    exact: true,
  });
  await expect
    .poll(async () => {
      const row = (await current.boundingBox())!,
        list = (await sidebar(page).boundingBox())!;
      return row.y >= list.y && row.y + row.height <= list.y + list.height;
    })
    .toBe(true);
});

test("menus dismiss predictably and expose accessible focus/selected states", async ({
  page,
}, info) => {
  await seed(page, 2);
  await actions(page).press("ArrowDown");
  const rename = page.getByRole("menuitem", { name: "Rename", exact: true });
  const remove = page.getByRole("menuitem", { name: "Delete", exact: true });
  await expect(rename).toBeFocused();
  await rename.press("ArrowDown");
  await expect(remove).toBeFocused();
  await remove.press("ArrowDown");
  await expect(rename).toBeFocused();
  await rename.press("End");
  await expect(remove).toBeFocused();
  await page.screenshot({
    path: info.outputPath("document-actions-focus.png"),
  });
  await remove.press("Escape");
  await expect(actions(page)).toBeFocused();
  await actions(page).press("ArrowUp");
  await expect(remove).toBeFocused();
  await remove.press("Escape");
  await actions(page).click();
  await selector(page).click();
  await expect(
    page.getByRole("menu", { name: "Document actions" }),
  ).toHaveCount(0);
  const search = page.getByRole("combobox", { name: "Search documents" });
  await search.press("Tab");
  await expect(
    page.getByRole("dialog", { name: "Switch document" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Find anything" }),
  ).toBeFocused();
  await selector(page).click();
  await page.locator(".brand").click();
  await expect(
    page.getByRole("dialog", { name: "Switch document" }),
  ).toHaveCount(0);
  for (const theme of ["Light", "Dark"]) {
    await page
      .getByRole("button", { name: `${theme} interface`, exact: true })
      .click();
    const audit = async () => {
      const result = await new AxeBuilder({ page })
        .include(".workspace-header-group")
        .include(".workspace-documents")
        .include(".header-popover")
        .analyze();
      expect(result.violations).toEqual([]);
    };
    await audit();
    await actions(page).click();
    await audit();
    await rename.press("Escape");
    await selector(page).click();
    await audit();
    await search.fill("no results");
    await audit();
    await search.press("Escape");
  }
});
