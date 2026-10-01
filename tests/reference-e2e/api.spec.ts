import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { defaultExportOptions } from "@folio/engine/types";
import { fixture } from "../fixtures";
import { unzipSync } from "fflate";
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
