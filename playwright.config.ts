import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run at 360px, the reference viewport.
 *
 * Not a nicety: every bug in this project that unit tests missed was a
 * rendering or wiring bug that only appeared when the built app ran in a real
 * browser at phone width.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "line" : "list",
  use: {
    baseURL: "http://localhost:4222",
    trace: "on-first-retry",
    ...(process.env["PW_CHROMIUM"]
      ? { launchOptions: { executablePath: process.env["PW_CHROMIUM"] } }
      : {}),
  },
  projects: [
    {
      name: "phone-360",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } },
    },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4222 --strictPort",
    url: "http://localhost:4222",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
