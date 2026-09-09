import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__ILOVEMD_ANALYTICS_DEBUG__ = []; });
});

test("branding, metadata and analytics remain private and deduplicated", async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on("request", request => { if (/google-analytics|googletagmanager/.test(request.url())) analyticsRequests.push(request.url()); });
  await page.goto("http://127.0.0.1:4180/?document_title=private#draft");
  await expect(page.getByRole("link", { name: "iLoveMd.tech home" })).toBeVisible();
  await expect(page).toHaveTitle(/iLoveMd\.tech/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ilovemd.tech/");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Dark interface" }).click();
  await page.waitForTimeout(1200);
  const events = await page.evaluate(() => window.__ILOVEMD_ANALYTICS_DEBUG__ ?? []);
  expect(events.filter(event => event.event === "page_view")).toHaveLength(1);
  expect(events.filter(event => event.event === "portfolio_link_impression")).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain("document_title");
  expect(JSON.stringify(events)).not.toContain("private");
  expect(analyticsRequests).toEqual([]);
});

test("portfolio activation is counted once and preserves navigation", async ({ page, context }) => {
  await page.goto("http://127.0.0.1:4180/");
  const link = page.getByRole("link", { name: "Made by" });
  await expect(link).toHaveAttribute("href", "https://portfolio.example.test/");
  const popupPromise = context.waitForEvent("page");
  await link.click();
  const popup = await popupPromise;
  expect(popup).toBeTruthy();
  const clicks = await page.evaluate(() => (window.__ILOVEMD_ANALYTICS_DEBUG__ ?? []).filter(event => event.event === "portfolio_link_click"));
  expect(clicks).toHaveLength(1);
});

test("SEO resources and real 404 status are served", async ({ request }) => {
  expect((await request.get("http://127.0.0.1:4180/robots.txt")).status()).toBe(200);
  expect(await (await request.get("http://127.0.0.1:4180/sitemap.xml")).text()).toContain("https://ilovemd.tech/privacy/");
  const privacy = await request.get("http://127.0.0.1:4180/privacy/");
  expect(privacy.status()).toBe(200);
  expect(await privacy.text()).toContain("Privacy notice");
  expect((await request.get("http://127.0.0.1:4180/not-a-real-page")).status()).toBe(404);
});
