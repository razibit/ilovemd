import { test, expect } from "@playwright/test";
import { replaceEditor, openZoom, closeZoom, toggleAnnotations, expectNotesSaved } from "./helpers";

for (const width of [1440, 1100, 768, 390, 320]) {
  test(`workspace space and controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.bringToFront();
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await replaceEditor(page.getByRole("textbox", { name: "Markdown source" }), "# Reading space\n\n" + "A paragraph for comfortable reading and scrolling.\n\n".repeat(100));
    await page.getByRole("textbox", { name: "Markdown source" }).press("Control+Home");
    await expect(page.locator("article h1")).toHaveText("Reading space");
    await expect(page.locator(".page-context,.annotation-save,.local-badge,.panel-label")).toHaveCount(0);
    const theme = page.getByRole("button", { name: "Toggle document theme" });
    await expect(theme).toBeVisible();
    expect(await theme.evaluate(e => e.nextElementSibling?.classList.contains("templates-button"))).toBe(true);
    const beforeTheme = await page.locator("article").getAttribute("data-theme");
    await theme.click();
    await expect(page.locator("article")).toHaveAttribute("data-theme", beforeTheme === "light" ? "dark" : "light");
    await theme.click();
    for (const mode of ["Split view", "Preview", "Editor"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      const scroller = page.locator(mode === "Editor" ? ".cm-scroller" : ".preview-scroll");
      await scroller.evaluate(e => e.scrollTop = 0);
      const slot = page.locator(".toolbar-slot"), panels = page.locator(".panels"), toolbar = page.locator(".workspace-toolbar");
      await expect(toolbar).not.toHaveClass(/toolbar-hidden/);
      const original = (await panels.boundingBox())!;
      const toolbarHeight = (await toolbar.boundingBox())!.height;
      const sourceHeight = await page.locator(".source-panel").evaluate(e => e.getBoundingClientRect().height);
      const previewHeight = await page.locator(".preview-panel").evaluate(e => e.getBoundingClientRect().height);
      if (mode === "Editor") await page.getByRole("textbox", { name: "Markdown source" }).focus();
      else await scroller.focus();
      await scroller.hover();
      // Focusing CodeMirror restores its cursor and may scroll it to the end.
      await scroller.evaluate(e => e.scrollTop = 0);
      await page.waitForTimeout(300);
      await page.mouse.wheel(0, 350);
      await expect(toolbar).toHaveClass(/toolbar-hidden/);
      await expect.poll(() => slot.evaluate(e => e.getBoundingClientRect().height)).toBe(0);
      const grown = (await panels.boundingBox())!;
      expect(grown.height - original.height).toBeCloseTo(toolbarHeight, 0);
      expect(original.y - grown.y).toBeCloseTo(toolbarHeight, 0);
      if (mode === "Split view") {
        expect(await page.locator(".source-panel").evaluate(e => e.getBoundingClientRect().height) - sourceHeight).toBeCloseTo(toolbarHeight, 0);
        expect(await page.locator(".preview-panel").evaluate(e => e.getBoundingClientRect().height) - previewHeight).toBeCloseTo(toolbarHeight, 0);
      }
      await expect(toolbar).toHaveAttribute("inert", "");
      // Bottom clamping must not reopen the toolbar or leave a placeholder.
      await scroller.evaluate(e => e.scrollTop = e.scrollHeight);
      await page.waitForTimeout(120);
      await expect(toolbar).toHaveClass(/toolbar-hidden/);
      const bottom = await scroller.evaluate(e => ({ top: e.scrollTop, height: e.scrollHeight }));
      await page.mouse.wheel(0, -80);
      await expect(toolbar).not.toHaveClass(/toolbar-hidden/);
      // CodeMirror replaces estimated heights as newly visible lines are measured.
      const afterScroll = await scroller.evaluate(e => ({ top: e.scrollTop, height: e.scrollHeight }));
      expect(afterScroll.top).toBeGreaterThan(bottom.top + afterScroll.height - bottom.height - 220);
      expect((await panels.boundingBox())!.height).toBeCloseTo(original.height, 0);
      await scroller.evaluate(e => e.scrollTop = 0);
      await page.screenshot({ path: `output/playwright/refined-${width}-${mode.replace(" ", "-")}.png` });
    }
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await openZoom(page);
    await expect(page.locator(".preview-controls")).toHaveCount(1);
    expect(await page.locator(".zoom-button").locator("button,input").count()).toBe(0);
    const pop = (await page.getByRole("dialog", { name: "Preview controls" }).boundingBox())!;
    expect(pop.x).toBeGreaterThanOrEqual(0); expect(pop.x + pop.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/refined-${width}-zoom.png` });
    await page.keyboard.press("Escape");
    await expect(page.locator(".zoom-button")).toBeFocused();
    await expect(page.locator(".preview-controls")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("palette is independent, precise, draggable and reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await toggleAnnotations(page);
  const palette = page.getByRole("group", { name: "Drawing tools", exact: true });
  await expect(palette).toBeVisible();
  await expect(page.locator(".preview-controls")).toHaveCount(0);
  await expect(palette.getByRole("group", { name: "Annotation tools", exact: true }).getByRole("button")).toHaveCount(10);
  const grip = page.getByRole("button", { name: "Move annotation palette" });
  const initial = (await palette.boundingBox())!;
  await grip.hover(); await page.mouse.down(); await page.mouse.move(180, 180, { steps: 8 }); await page.mouse.up();
  const moved = (await palette.boundingBox())!;
  expect(moved.x).toBeLessThan(initial.x - 100);
  await expect(page.locator(".annotation-layer [data-note-id]")).toHaveCount(0);
  await expect(palette.getByRole("button", { name: "Pen", exact: true })).toHaveAttribute("aria-pressed", "true");
  await grip.press("ArrowRight");
  expect((await palette.boundingBox())!.x).toBeCloseTo(moved.x + 5, 0);
  await page.getByRole("button", { name: "Blue stroke" }).click();
  await expect(page.getByRole("button", { name: "Blue stroke" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Stroke color", { exact: true }).fill("#123456");
  await expect(page.getByLabel("Selected color: #123456", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Stroke width 8", exact: true }).click();
  const settingsPosition = (await palette.boundingBox())!;
  await page.getByLabel("Stroke settings", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Stroke width", exact: true }).fill("13");
  await page.getByRole("slider", { name: "Stroke opacity" }).fill("0.65");
  await page.getByRole("slider", { name: "Stroke smoothing" }).fill("0.55");
  await page.getByRole("checkbox", { name: "Snap endpoints and angles" }).check();
  expect((await palette.boundingBox())!.x).toBe(settingsPosition.x);
  await page.getByLabel("Stroke settings", { exact: true }).click();
  // Move away from the preview and draw with the exact custom settings.
  await grip.hover(); await page.mouse.down(); await page.mouse.move(120, 100, { steps: 5 }); await page.mouse.up();
  const layer = page.locator(".annotation-layer"); const r = (await layer.boundingBox())!;
  await page.mouse.move(r.x + 60, r.y + 250); await page.mouse.down(); await page.mouse.move(r.x + 160, r.y + 250, { steps: 8 }); await page.mouse.up();
  await expect(layer.locator("[data-note-id]")).toHaveCount(1);
  await expect(layer.locator("path").first()).toHaveAttribute("stroke", "#123456");
  await expectNotesSaved(page);
  const savedStyle = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("folio"); r.onsuccess = () => resolve(r.result); });
    const sets = await new Promise<any[]>(resolve => { const r = db.transaction("annotations").objectStore("annotations").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); return sets[0].objects[0];
  });
  expect(savedStyle).toMatchObject({color: "#123456", width: 13, opacity: .65});
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await page.mouse.click(r.x + 110, r.y + 250);
  await expect(layer.locator("[data-note-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo note", exact: true }).click();
  await expect(layer.locator("[data-note-id]")).toHaveCount(1);
  await openZoom(page); await page.getByRole("button", { name: "Pan page", exact: true }).click(); await closeZoom(page);
  const scrollBefore = await page.locator(".preview-scroll").evaluate(e => [e.scrollLeft, e.scrollTop]);
  await grip.hover(); await page.mouse.down(); await page.mouse.move(250, 160, { steps: 5 }); await page.mouse.up();
  expect(await page.locator(".preview-scroll").evaluate(e => [e.scrollLeft, e.scrollTop])).toEqual(scrollBefore);
  await expect(layer.locator("[data-note-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Editor", exact: true }).click(); await expect(palette).toBeHidden();
  await page.getByRole("button", { name: "Preview", exact: true }).click(); await expect(palette).toBeVisible();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 600 });
    await expect.poll(async () => { const b = (await palette.boundingBox())!; return b.x >= 8 && b.y >= 8 && b.x + b.width <= width - 7 && b.y + b.height <= 593; }).toBe(true);
    await page.screenshot({ path: `output/playwright/refined-${width}-palette.png` });
  }
});

test("zoom endpoints, dismissal, reset and fit retain a single state", async ({ page }) => {
  await page.goto("/"); await expect(page.locator("article h1")).toBeVisible();
  await openZoom(page);
  const slider = page.getByRole("slider", { name: "Preview zoom", exact: true });
  for (const zoom of [25, 138, 400]) {
    await slider.fill(String(zoom));
    await expect(page.locator(".zoom-button")).toContainText(`${zoom}%`);
    await expect(page.getByLabel("Zoom percentage")).toHaveText(`${zoom}%`);
    expect(await page.locator(".preview-surface").evaluate(e => getComputedStyle(e).transform)).toBe(`matrix(${zoom / 100}, 0, 0, ${zoom / 100}, 0, 0)`);
  }
  await slider.press("ArrowLeft"); await expect(slider).toHaveValue("399");
  await page.getByRole("button", { name: "Reset preview zoom" }).click();
  await expect(slider).toHaveValue("100");
  expect(await page.locator(".preview-scroll").evaluate(e => e.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Fit width", exact: true }).click();
  await expect.poll(() => page.locator(".preview-scroll").evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  await page.locator(".brand").click(); await expect(page.locator(".preview-controls")).toHaveCount(0);
});
