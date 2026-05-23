import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

const webServerEnv = {
  ...process.env,
  E2E_FIXTURES: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  AUTH_SECRET: "ci-auth-secret-placeholder-32-characters",
  ADMIN_EMAIL: "admin@example.com",
  AUTH_GOOGLE_ID: "ci-google-client-id",
  AUTH_GOOGLE_SECRET: "ci-google-client-secret",
  ENABLE_PASSWORD_LOGIN: "false",
  RESEND_API_KEY: "re_ci_placeholder",
  SELLER_EMAIL: "seller@example.com",
  ORDER_EMAIL_FROM: "Wiko Spellbook CI <orders@example.com>",
  DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["dot"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: webServerEnv,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
