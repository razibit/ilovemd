import { replaceEditor } from './helpers';
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile } from "node:fs/promises";
import { scientific } from "../fixtures";
async function replaceSource(page: any, source: string) {
  const editor = page.getByRole("textbox", { name: "Markdown source" });
  await replaceEditor(editor, source);
  await expect(page.getByRole("button", { name: "Annotate" })).toBeEnabled();
}
test("editing, view switching, undo, themes, history and recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("article .katex").first()).toBeVisible();
  await page.screenshot({ path: "output/playwright/workspace-light.png" });
  await replaceSource(
    page,
    "# Journey test\n\nPreserve these words.\n\n$\\frac{1}{2}$",
  );
  await expect(page.locator("article h1")).toHaveText("Journey test");
  // CodeMirror groups adjacent typing within 500 ms into one undo event.
  await page.waitForTimeout(600);
  await page.getByRole('textbox',{name:'Markdown source'}).press('Control+End');
  await page.getByRole('textbox',{name:'Markdown source'}).press('X');
  await expect(page.locator('article')).toContainText('X');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Markdown source'})).not.toContainText('X');
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown source" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown source" }),
  ).toContainText("Preserve these words");
  await page
    .getByRole("button", { name: "Dark interface", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Toggle document theme" }).click();
  await expect(page.locator("article")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator("article h1")).toHaveText("Journey test");
  await expect(page.locator("article")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Local history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Preserve these words");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({ path: "output/playwright/workspace-dark.png" });
  expect(errors).toEqual([]);
});
test("PDF preview and downloaded artifact are real and source stays unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceSource(page, scientific);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Generate export preview" }).click();
  await expect(page.locator(".pdf-pages canvas").first()).toBeVisible({
    timeout: 45000,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download document.pdf" }).click();
  const download = await downloadPromise;
  await download.saveAs("output/playwright/journey.pdf");
  const bytes = await readFile("output/playwright/journey.pdf");
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  await page.screenshot({ path: "output/playwright/pdf-preview.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown source" }),
  ).toContainText("Scientific regression");
});
test("missing image blocks export and explicitly acknowledged warning succeeds", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceSource(
    page,
    "# Missing image\n\n![Missing figure](assets/missing.png)",
  );
  await expect(page.locator("article")).toContainText("Image unavailable");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Generate export preview" }).click();
  await expect(page.getByRole("alert")).toContainText("Export needs attention");
  await page
    .getByRole("checkbox", { name: "Export with visible warnings" })
    .check();
  await page.getByRole("button", { name: "Retry export" }).click();
  await expect(
    page.getByRole("button", { name: "Download document.pdf" }),
  ).toBeVisible({ timeout: 45000 });
});
test("image upload, bundle roundtrip and local asset recovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceSource(page, "# Asset roundtrip\n\n");
  await page.locator('input[type=file][accept^="image"]').setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: await readFile("output/pdf/document.png"),
  });
  await page
    .getByRole("textbox", { name: "Alternative text", exact: true })
    .fill("A real exported image");
  await page
    .getByRole("button", { name: "Insert image", exact: true })
    .last()
    .click();
  await expect(page.locator("article img")).toBeVisible();
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator("article img")).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Source + assets", exact: true })
    .click();
  const dl = await promise;
  await dl.saveAs("output/playwright/roundtrip.zip");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await replaceSource(page, "# Changed");
  await page
    .locator('input[type=file][accept^=".md"]')
    .setInputFiles("output/playwright/roundtrip.zip");
  await expect(page.locator("article h1")).toHaveText("Asset roundtrip");
  await expect(page.locator("article img")).toBeVisible();
});
test("sync scroll maps blocks in both directions and disables independently", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  const source = Array.from(
    { length: 35 },
    (_, i) =>
      `## Heading ${i}\n\nParagraph ${i}. ` +
      "Long content to create unequal panel heights. ".repeat(6),
  ).join("\n\n");
  await replaceSource(page, source);
  await page.locator(".cm-scroller").evaluate((el) => (el.scrollTop = 700));
  await expect
    .poll(() => page.locator(".preview-scroll").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(200);
  await page.waitForTimeout(200);
  await page.locator(".preview-scroll").evaluate((el) => (el.scrollTop = 2500));
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(700);
  await page.getByLabel("More workspace controls").click();
  await page.getByRole("switch", { name: "Sync scroll" }).click();
  await page.waitForTimeout(200);
  const before = await page
    .locator(".preview-scroll")
    .evaluate((el) => el.scrollTop);
  await page.locator(".cm-scroller").evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(200);
  expect(
    await page.locator(".preview-scroll").evaluate((el) => el.scrollTop),
  ).toBe(before);
});
test("keyboard commands, responsive layout and accessibility checks", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  await writeFile(
    "output/playwright/axe-light.json",
    JSON.stringify(results.violations, null, 2),
  );
  expect(results.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Dark interface", exact: true })
    .click();
  await page.getByRole("button", { name: "Toggle document theme" }).click();
  const dark = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  await writeFile(
    "output/playwright/axe-dark.json",
    JSON.stringify(dark.violations, null, 2),
  );
  expect(dark.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("article h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "output/playwright/mobile.png" });
});
test("unsafe markup cannot run and Mermaid renders as sanitized SVG", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceSource(
    page,
    "# Safe document\n\n<script>window.INJECTED=true</script>\n\n```mermaid\nflowchart LR\n A[Write] --> B[Preview] --> C[Export]\n```",
  );
  await expect(page.locator("article .diagram svg")).toBeVisible();
  expect(await page.evaluate(() => (window as any).INJECTED)).toBeUndefined();
  expect(await page.locator("article script").count()).toBe(0);
  await page.screenshot({ path: "output/playwright/diagram.png" });
});
