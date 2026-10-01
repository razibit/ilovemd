import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { replaceEditor, expectNotesSaved } from "./helpers";

test("native Chrome browser zoom preserves pointer and image geometry", async ({}, info) => {
  test.skip(
    info.project.name !== "chrome-debug",
    "Native browser settings require headed Chrome.",
  );
  test.setTimeout(120000);
  // A disposable persistent profile is required for Chrome's settings UI.
  // This changes real browser zoom, independently of preview zoom and CDP DPR.
  const profile = await mkdtemp("output/playwright/native-zoom-");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: false,
    viewport: null,
    deviceScaleFactor: undefined,
  });
  const settings = await context.newPage();
  const results: { zoom: number; dpr: number; width: number }[] = [];
  try {
    await settings.goto("chrome://settings/appearance");
    await settings.locator("#zoomLevel").waitFor();
    for (const zoom of [100, 75, 125, 175]) {
      await settings.locator("#zoomLevel").selectOption({ label: `${zoom}%` });
      const page = await context.newPage();
      await page.bringToFront();
      await page.goto(info.project.use.baseURL as string);
      await expect(page.locator("article h1")).toBeVisible();
      if (zoom === 100) {
        await replaceEditor(
          page.getByRole("textbox", { name: "Markdown source" }),
          "# Native browser zoom\n\n" +
            "> **Experience**  \n> DenZo — Founding Engineer & CEO  \n>\n> **Projects**  \n> DenZo\n\n" +
            "Browser zoom preserves this document.\n\n".repeat(8),
        );
        await expect(page.locator("article h1")).toHaveText(
          "Native browser zoom",
        );
      }
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await page.getByRole("button", { name: "Annotate", exact: true }).click();
      await page.getByRole("button", { name: "Line", exact: true }).click();
      await page
        .getByRole("button", { name: "Red stroke", exact: true })
        .click();
      const layer = page.locator(".annotation-layer");
      await expect(layer).toBeVisible();
      await expect(layer).toHaveClass(/drawing-enabled/);
      await page.locator(".preview-scroll").evaluate((e) => {
        e.scrollTop = e.scrollLeft = 0;
      });
      const points = await layer.evaluate((e) => {
        const matrix = (e as SVGSVGElement).getScreenCTM()!;
        return [new DOMPoint(70, 120), new DOMPoint(135, 120)]
          .map((p) => p.matrixTransform(matrix))
          .map((p) => ({ x: p.x, y: p.y }));
      });
      await page.bringToFront();
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      await page.mouse.move(points[1].x, points[1].y);
      await page.mouse.up();
      const line = layer.locator("g[data-note-id] path").last();
      await expect(line).toHaveAttribute("d", /^M/);
      const coordinates = (await line.getAttribute("d"))!
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number);
      expect(Math.abs(coordinates[0] - 70)).toBeLessThan(1);
      expect(Math.abs(coordinates.at(-2)! - 135)).toBeLessThan(1);
      await expectNotesSaved(page);
      results.push(
        await page.evaluate(
          (zoom) => ({ zoom, dpr: devicePixelRatio, width: innerWidth }),
          zoom,
        ),
      );
      expect(results.at(-1)!.dpr / results[0].dpr).toBeCloseTo(zoom / 100, 2);
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await page.getByRole("button", { name: "PNG Capture & present" }).click();
      await page
        .getByRole("checkbox", { name: "Include annotations", exact: true })
        .check();
      await page
        .getByRole("spinbutton", { name: "Scale", exact: true })
        .fill("2");
      await page
        .getByRole("button", { name: /Generate export preview|Retry export/ })
        .click();
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download document.png", exact: true })
        .click();
      const bytes = await readFile((await (await download).path())!);
      await writeFile(
        `output/playwright/native-zoom-${zoom}-export.png`,
        bytes,
      );
      const crop = await sharp(bytes)
        .extract({ left: 140, top: 238, width: 130, height: 6 })
        .toBuffer();
      const stats = await sharp(crop).stats();
      expect(stats.channels[0].mean).toBeGreaterThan(
        stats.channels[1].mean + 50,
      );
      await page.screenshot({
        path: `output/playwright/native-zoom-${zoom}.png`,
      });
      await page.close();
    }
    await writeFile(
      "output/playwright/native-browser-zoom.json",
      JSON.stringify(results, null, 2),
    );
  } finally {
    await context.close();
  }
});
