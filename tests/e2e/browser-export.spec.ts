import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { replaceEditor } from "./helpers";

const documentSource = `# Browser export regression

বাংলা, العربية, and Unicode ✓ remain visible.

| Feature | Result |
| --- | --- |
| Tables | Preserved |
| Mathematics | $E = mc^2$ |

\`\`\`typescript
const exported: boolean = true;
\`\`\`

\`\`\`mermaid
flowchart LR
  A[Edit] --> B[Preview] --> C[Export]
\`\`\`

${"A long paragraph exercises browser-side pagination without a remote service.\n\n".repeat(55)}

FINAL_BROWSER_EXPORT_MARKER
`;

async function prepare(page: import("@playwright/test").Page) {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceEditor(page.getByRole("textbox", { name: "Markdown source" }), documentSource);
  await expect(page.locator("article .diagram svg").first()).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  return apiRequests;
}

async function generateAndDownload(
  page: import("@playwright/test").Page,
  format: "pdf" | "png" | "html",
  name: string,
) {
  const labels = {
    pdf: "PDF Print & share",
    png: "PNG Capture & present",
    html: "HTML Publish & archive",
  };
  await page.getByRole("button", { name: labels[format] }).click();
  await page.getByRole("button", { name: /Generate export preview|Retry export/ }).click();
  const button = page.getByRole("button", { name: new RegExp(`Download document\\.${format}`) });
  await expect(button).toBeVisible({ timeout: 60_000 });
  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const path = `output/playwright/${name}`;
  await download.saveAs(path);
  return readFile(path);
}

test("PDF, PNG and standalone HTML export entirely in the browser", async ({ page }) => {
  test.setTimeout(180_000);
  const apiRequests = await prepare(page);

  const pdf = await generateAndDownload(page, "pdf", "browser-regression.pdf");
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  const info = execFileSync("pdfinfo", ["output/playwright/browser-regression.pdf"], {
    encoding: "utf8",
  });
  expect(Number(info.match(/Pages:\s+(\d+)/)?.[1])).toBeGreaterThan(1);
  execFileSync("pdftoppm", [
    "-f", "1", "-singlefile", "-scale-to", "1200", "-png",
    "output/playwright/browser-regression.pdf",
    "output/playwright/browser-regression-page",
  ]);
  const pdfPage = await sharp("output/playwright/browser-regression-page.png").stats();
  expect(pdfPage.channels.some((channel) => channel.stdev > 10)).toBeTruthy();

  const png = await generateAndDownload(page, "png", "browser-regression.png");
  const pngMeta = await sharp(png).metadata();
  expect(pngMeta.format).toBe("png");
  expect(pngMeta.width).toBe(1440);
  expect(pngMeta.height).toBeGreaterThan(1000);

  const html = (await generateAndDownload(page, "html", "browser-regression.html")).toString();
  expect(html).toContain("FINAL_BROWSER_EXPORT_MARKER");
  expect(html).toContain("data:font/");
  expect(html).toContain("<svg");
  expect(html).not.toMatch(/<script/i);
  expect(apiRequests).toEqual([]);
});

test("page-image ZIP, repeated export and empty documents are handled", async ({ page }) => {
  test.setTimeout(180_000);
  await prepare(page);
  await page.getByRole("button", { name: "PNG Capture & present" }).click();
  await page.getByRole("combobox", { name: "Capture" }).selectOption("pages");
  await page.getByRole("button", { name: "Generate export preview" }).click();
  const zipButton = page.getByRole("button", { name: "Download document-pages.zip" });
  await expect(zipButton).toBeVisible({ timeout: 60_000 });
  let downloadPromise = page.waitForEvent("download");
  await zipButton.click();
  let download = await downloadPromise;
  await download.saveAs("output/playwright/browser-pages.zip");
  const pages = unzipSync(await readFile("output/playwright/browser-pages.zip"));
  expect(Object.keys(pages).filter((name) => name.endsWith(".png")).length).toBeGreaterThan(1);

  await page.getByRole("button", { name: "Generate export preview" }).click();
  await expect(zipButton).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Close dialog" }).click();
  await replaceEditor(page.getByRole("textbox", { name: "Markdown source" }), "");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "PNG Capture & present" }).click();
  await page.getByRole("combobox", { name: "Capture" }).selectOption("document");
  await page.getByRole("button", { name: "Generate export preview" }).click();
  await expect(page.getByRole("button", { name: "Download document.png" })).toBeVisible({ timeout: 60_000 });

});

test("an in-progress browser export can be cancelled and retried", async ({ page }) => {
  await page.route("**/browser-export-*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Generate export preview" }).click();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Retry export" })).toBeEnabled();
});
