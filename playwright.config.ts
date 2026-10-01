import { defineConfig, devices } from "@playwright/test";
const frontendUrl = process.env.FOLIO_FRONTEND_URL ?? "http://127.0.0.1:4174";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    // Keep one copy of retained traces on storage-constrained developer devices.
    ["json", { outputFile: "output/playwright/test-results.json" }],
  ],
  outputDir: "output/playwright/results",
  use: {
    baseURL: frontendUrl,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "chrome-debug",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: false,
        // Keep the emulated page's native input surface unobstructed. Inspect
        // DevTools separately: docked DevTools changes Chrome's compositor
        // hit testing independently of Playwright's emulated viewport.
        viewport: { width: 1440, height: 1000 },
        trace: "on",
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: `npm exec -w @folio/web vite build -- --outDir ../../output/static-frontend && node tests/static-server.mjs --port ${new URL(frontendUrl).port}`,
    env: {
      VITE_ANALYTICS_MODE: "disabled",
      VITE_PORTFOLIO_URL: "https://portfolio.example.test/",
    },
    url: frontendUrl,
    reuseExistingServer: !!process.env.FOLIO_FRONTEND_URL,
  },
});
