import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de l'interface servie par le serveur de dev (webpack serve, port 8066, #2045).
 * Chromium par défaut ; E2E_ALL_BROWSERS=1 ajoute Firefox, WebKit et les mobiles.
 * Navigateur requis : npx playwright install chromium
 * @see https://playwright.dev/docs/test-configuration
 */

/** Port du serveur de dev du renderer (webpack.renderer.config.js, devServer.port) */
const DEV_PORT = 8066;
const BASE_URL = `http://localhost:${DEV_PORT}`;
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Captures de référence (toHaveScreenshot) par plateforme, créées si absentes (#1157) */
  updateSnapshots: 'missing',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}',

  /* Reporter to use */
  reporter: 'html',

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: BASE_URL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure */
    video: 'on-first-retry',
  },

  /* Chromium par défaut ; autres navigateurs sur demande (E2E_ALL_BROWSERS=1) */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(process.env.E2E_ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
          { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
        ]
      : []),
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    // Renderer seul : les E2E ouvrent l'interface dans le navigateur (sans process principal)
    command: 'npm run dev:renderer',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Première compilation webpack : jusqu'à ~2 min sur une machine lente
    timeout: 240000,
  },
});
