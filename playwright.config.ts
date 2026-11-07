import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Housy Monorepo.
 * Starts both Express API (port 3001) and Vite Web (port 5173).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests serially to maintain clean, deterministic DB state
  workers: 1,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        PORT: '3001',
        NODE_ENV: 'test',
        LLM_PROVIDER: 'mock',
        RATE_LIMIT_LOGIN_MAX: '1000',
        RATE_LIMIT_LOGIN_WINDOW_MS: '60000',
        RATE_LIMIT_GENERAL_MAX: '5000',
        RATE_LIMIT_CHAT_MAX: '1000',
      },
    },
    {
      command: 'npm run dev:web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});

