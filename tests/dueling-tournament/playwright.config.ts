import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: 'list',
  outputDir: '../../test-results/dueling',
  use: {
    baseURL: 'http://127.0.0.1:56501',
    headless: true,
    viewport: { width: 1000, height: 800 },
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
