import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/reference-e2e",
  use: { baseURL: "http://127.0.0.1:4175" },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4175/api/health",
    env: { PORT: "4175" },
    reuseExistingServer: true,
  },
  workers: 1,
});
