import { replaceEditor } from './helpers';
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { defaultExportOptions } from "@folio/engine/types";
import { fixture } from "../fixtures";
import {unzipSync} from 'fflate';
test('empty artifact responses are rejected without false success',async({page})=>{await page.goto('/');await expect(page.locator('article h1')).toBeVisible();await page.route('**/api/exports/*/0',route=>route.fulfill({status:204}));await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Generate export preview'}).click();await expect(page.getByRole('alert')).toContainText('empty or intercepted');await expect(page.getByRole('button',{name:'Download document.pdf'})).toHaveCount(0)});
test("competing tabs retain both revisions instead of overwriting", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await replaceEditor(page
    .getByRole("textbox", { name: "Markdown source" }), "# Tab A preserved");
  await expect(page.getByRole("status")).toContainText("Another tab");
  await replaceEditor(other
    .getByRole("textbox", { name: "Markdown source" }), "# Tab B preserved");
  await expect(other.locator(".save-indicator")).toContainText(
    "Saved on this device",
  );
  await page
    .getByRole("button", { name: "Local history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Tab A preserved");
  await expect(page.getByRole("dialog")).toContainText("Tab B preserved");
});
test("API rejects cross-origin requests, invalid options and unauthorized artifacts", async ({
  request,
}) => {
  const body = { snapshot: fixture("# Secure"), options: defaultExportOptions };
  expect(
    (
      await request.post("/api/exports", {
        headers: { Origin: "https://untrusted.example" },
        data: body,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/exports", {
        data: { ...body, options: { ...defaultExportOptions, scale: 999 } },
      })
    ).status(),
  ).toBe(400);
  expect((await request.get("/api/exports/unknown/0")).status()).toBe(404);
  const generated = await request.post("/api/exports", { data: body });
  expect(generated.status()).toBe(200);
  const job = await generated.json();
  expect((await request.get(job.artifacts[0].url)).status()).toBe(404);
  expect(
    (
      await request.get(job.artifacts[0].url, {
        headers: { "X-Export-Token": job.token },
      })
    ).status(),
  ).toBe(200);
  await request.delete(`/api/exports/${job.id}`, {
    headers: { "X-Export-Token": job.token },
  });
  expect(
    (
      await request.get(job.artifacts[0].url, {
        headers: { "X-Export-Token": job.token },
      })
    ).status(),
  ).toBe(404);
});
test("PNG page images, selected block and manual page breaks", async ({
  request,
}) => {
  const body = {
    snapshot: fixture(
      "# First page\n\nFirst page content.\n\n::pagebreak\n\n# Second page\n\nSecond page content.",
    ),
    options: { ...defaultExportOptions, format: "png", pngMode: "pages" },
  };
  const response = await request.post("/api/exports", { data: body });
  expect(response.status()).toBe(200);
  const job = await response.json();
  const artifact = await request.get(job.artifacts[0].url, {
    headers: { "X-Export-Token": job.token },
  });
  const bytes = await artifact.body();
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(Object.keys(unzipSync(bytes)).filter(name=>name.endsWith('.png')).length).toBe(2);
  await writeFile("output/playwright/page-images.zip", bytes);
  await request.delete(`/api/exports/${job.id}`, {
    headers: { "X-Export-Token": job.token },
  });
  const selected = await request.post("/api/exports", {
    data: {
      ...body,
      options: { ...body.options, pngMode: "selection", selection: "block-0" },
    },
  });
  expect(selected.status()).toBe(200);
});
test("remote embeds are opt-in and malicious SVG upload is refused", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  await replaceEditor(page
    .getByRole("textbox", { name: "Markdown source" }), '# Video\n\n::video{url="https://youtu.be/abcdef12345" title="Demonstration"}');
  await expect(
    page.getByRole("button", { name: "Load external video" }),
  ).toBeVisible();
  expect(await page.locator("iframe").count()).toBe(0);
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({ body: "<p>Mock provider</p>", contentType: "text/html" }),
  );
  await page.getByRole("button", { name: "Load external video" }).click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-presentation",
  );
  await page
    .locator('input[accept^="image"]')
    .setInputFiles({
      name: "unsafe.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
    });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator('img[alt="Uploaded image preview"]')).toBeVisible();
});
test("typing and rendering performance measurements use 30 warm samples", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expect(page.locator("article h1")).toBeVisible();
  const samples: number[] = [];
  const input: number[] = [];
  const math = Array.from(
    { length: 100 },
    (_, i) => `Equation ${i}: $\\frac{${i + 1}}{2}+\\sqrt{x}$\n\n`,
  ).join("");
  const paragraph =
    "Representative writing with ordinary words, links and punctuation. ".repeat(
      50,
    ) + "\n\n";
  const source = "# Performance fixture\n\n" + math + paragraph.repeat(30);
  await replaceEditor(page.getByRole("textbox", { name: "Markdown source" }), source);
  await expect(page.locator(".live-state")).toHaveText("Up to date");
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    await page
      .getByRole("textbox", { name: "Markdown source" })
      .press("Control+End");
    await page.getByRole("textbox", { name: "Markdown source" }).press("x");
    input.push(performance.now() - start);
    await expect(page.locator(".live-state")).toHaveText("Up to date");
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  input.sort((a, b) => a - b);
  await writeFile(
    "output/playwright/performance.json",
    JSON.stringify(
      {
        environment: await page.evaluate(() => ({
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
        })),
        sourceBytes: Buffer.byteLength(source),
        equations: 100,
        images: 0,
        samples: 30,
        inputAutomationP95Ms: input[28],
        settledPreviewAutomationP95Ms: samples[28],
        note: "Includes Playwright locator and polling overhead. Not an INP measurement; image-heavy reference budget remains unverified.",
      },
      null,
      2,
    ),
  );
  expect(samples[28]).toBeLessThan(5000);
});
