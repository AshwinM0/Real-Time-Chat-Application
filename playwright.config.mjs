import { defineConfig } from "@playwright/test";
import { API, WEB } from "./e2e/urls.mjs";

export default defineConfig({
  testDir: "e2e",
  // Presence and delivery go through a real socket; give them a little longer than the 5s default.
  expect: { timeout: 10_000 },
  use: { baseURL: WEB, trace: "on-first-retry", screenshot: "only-on-failure" },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  projects: [
    { name: "e2e", testDir: "e2e/tests" },     // real backend
    { name: "mocked", testDir: "e2e/mocked" }, // page.route() fakes the API
  ],
  webServer: [
    {
      command: "node e2e/start-backend.mjs", // MongoDB in memory + backend on 5100
      url: `${API}/socket.io/?EIO=4&transport=polling`,
      env: { PORT: "5100", CLIENT_ORIGIN: WEB, JWT_SECRET: "e2e-secret", NODE_ENV: "test" },
      timeout: 180_000, // the first run on a machine downloads the MongoDB binary
    },
    {
      // A production build, which is what users get. The dev server serves every
      // source file separately and fell behind with many pages opening in
      // parallel, leaving some blank. Built into its own folder so it never
      // replaces your dist/. VITE_API_URL is read at build time.
      command: "npm --prefix frontend run build -- --outDir dist-e2e --emptyOutDir"
        + " && npm --prefix frontend run preview -- --outDir dist-e2e --port 3100 --strictPort",
      url: WEB,
      env: { VITE_API_URL: API },
    },
  ],
});
