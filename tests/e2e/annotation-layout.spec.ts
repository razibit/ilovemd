import { test, expect } from "@playwright/test";
import { toggleAnnotations, expectNotesSaved } from "./helpers";
import { replaceEditor } from "./helpers";
import { readFile, writeFile } from "node:fs/promises";

const resumeReview = String.raw`The resume is already strong for an early-career software candidate, but **I would change the DenZo structure**. Right now, DenZo occupies four bullets across two sections, and the separation feels artificial rather than additive.

### The main issue: DenZo in both Experience and Projects

There is no hard rule forbidding the same work from appearing in both sections. Berkeley explicitly notes that project work can appear either in a Projects section or as part of Work Experience, while Yale treats Projects as a flexible place for independent/class technical work. :chatgpt-content-reference{index="0"}

But resumes are supposed to select the most relevant evidence rather than repeat it, especially for an early-career one-page resume. UIUC explicitly recommends one page for new grads/early-career candidates and emphasizes **quality over quantity**. :chatgpt-content-reference{index="1"}

In **your particular case**, I would put DenZo **only under Experience**.

Why? Because DenZo is not merely another portfolio project. Your career KB verifies a system with four web apps, 15 backend services, six shared packages, multi-vendor checkout, transactional inventory handling, SSLCommerz payment validation, Pathao logistics, commission/ledger systems, seller attribution, Azure infrastructure, and more. Your Git history also contains attributable engineering work across many of those areas. (records/projects/project--denzo.md; derived/derived--denzo-candidates.md.)

So this:

> **Experience**  
> DenZo — Founding Engineer & CEO  
>
> **Projects**  
> DenZo

makes DenZo look a little more like a personal project than it deserves.

I would instead make the story:

> **Experience:** DenZo = the major real-world engineering/startup experience  
> **Projects:** Serendiply, PhoneDB + Scraper, Mess, HPE, AI Text Moderation = evidence of technical breadth

That is a cleaner narrative.

---

## More importantly, your DenZo Experience bullets are weaker than your DenZo Project bullets

This is probably the biggest content issue in the resume.

Your current Experience bullets are:

> Developed a TypeScript multi-vendor commerce platform...

and:

> Worked across seller catalog and checkout, inventory reservation...

They're accurate, but they're **summary/responsibility bullets**.
`;

test("long resume review blockquotes keep frozen layout during annotated export", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await replaceEditor(
    page.getByRole("textbox", { name: "Markdown source" }),
    resumeReview +
      "\n\n" +
      Array.from(
        { length: 20 },
        (_, i) =>
          `## Additional section ${i}\n\n${"Long paragraphs remain beneath document-relative annotations. ".repeat(5)}\n\n`,
      ).join(""),
  );
  await expect(page.locator("article blockquote")).toHaveCount(4);
  await toggleAnnotations(page);
  const layer = page.locator(".annotation-layer");
  await expect(layer).toHaveClass(/drawing-enabled/);
  // Inserting a long source synchronizes the preview to the editor's end.
  // Return to the visible document origin before drawing the top-page stroke.
  await page.locator(".preview-scroll").evaluate((el) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });
  await expect
    .poll(() => page.locator(".preview-scroll").evaluate((el) => el.scrollTop))
    .toBe(0);
  const bounds = (await layer.boundingBox())!;
  await page.mouse.move(bounds.x + 70, bounds.y + 120);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 160, bounds.y + 140, { steps: 5 });
  await page.mouse.up();
  await expect(layer.locator("g[data-note-id]")).toHaveCount(1);
  await expectNotesSaved(page);
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("folio");
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const request = db
          .transaction("annotations")
          .objectStore("annotations")
          .getAll();
        request.onsuccess = () => resolve(request.result.at(-1));
      });
    } finally {
      db.close();
    }
  });
  // The live surface can be remeasured after capture. Export must use the
  // geometry saved with the notes, rather than mix it with the newer context.
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page
    .locator("article")
    .evaluate((el) =>
      (el as HTMLElement).style.setProperty("--doc-leading", "2.4"),
    );
  await toggleAnnotations(page);
  await page.locator("article #block-17").click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("checkbox", { name: "Include annotations" }).check();
  await page.getByRole("button", { name: "HTML Publish & archive" }).click();
  await page
    .getByRole("button", { name: /Generate export preview|Retry export/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Download document.html", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download document.html", exact: true })
    .click();
  const exported = await readFile((await (await pending).path())!, "utf8");
  await writeFile("output/playwright/resume-review-layout.html", exported);
  const standalone = await page.context().newPage();
  try {
    await standalone.setContent(exported);
    await standalone.evaluate(() => document.fonts.ready);
    const differences = await standalone
      .locator("article")
      .evaluate((article, blocks: any[]) => {
        const origin = article.getBoundingClientRect();
        return blocks.map((block) => {
          const actual = article
            .querySelector(`#${block.id}`)!
            .getBoundingClientRect();
          return Math.max(
            Math.abs(actual.x - origin.x - block.x),
            Math.abs(actual.y - origin.y - block.y),
            Math.abs(actual.width - block.width),
            Math.abs(actual.height - block.height),
          );
        });
      }, saved.blocks);
    expect(Math.max(...differences)).toBeLessThanOrEqual(1);
  } finally {
    await standalone.close();
  }
  await page.getByRole("button", { name: "PDF Print & share" }).click();
  await page
    .getByRole("button", { name: /Generate export preview|Retry export/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Download document.pdf", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const pdfDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download document.pdf", exact: true })
    .click();
  await (
    await pdfDownload
  ).saveAs("output/playwright/resume-review-layout.pdf");
  await page.getByRole("button", { name: "PNG Capture & present" }).click();
  await page
    .getByRole("combobox", { name: "Capture", exact: true })
    .selectOption("selection");
  await page
    .getByRole("button", { name: /Generate export preview|Retry export/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Download document.png", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const pngDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download document.png", exact: true })
    .click();
  await (
    await pngDownload
  ).saveAs("output/playwright/resume-review-layout-selection.png");
});

test("the welcome document preserves every annotated block in all exports", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expect(page.locator("article .folio-columns")).toBeVisible();
  await toggleAnnotations(page);
  const layer = page.locator(".annotation-layer");
  await expect(layer).toHaveClass(/drawing-enabled/);
  const bounds = (await layer.boundingBox())!;
  await page.mouse.move(bounds.x + 70, bounds.y + 120);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 140, bounds.y + 130, { steps: 5 });
  await page.mouse.up();
  await expect(layer.locator("g[data-note-id]")).toHaveCount(1);
  await expectNotesSaved(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("checkbox", { name: "Include annotations" }).check();
  for (const [label, extension] of [
    ["HTML Publish & archive", "html"],
    ["PNG Capture & present", "png"],
    ["PDF Print & share", "pdf"],
  ]) {
    await page.getByRole("button", { name: label }).click();
    await page
      .getByRole("button", { name: /Generate export preview|Retry export/ })
      .click();
    await expect(
      page.getByRole("button", {
        name: `Download document.${extension}`,
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
  }
});
