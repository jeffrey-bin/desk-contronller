import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: '../../logs/e2e/playwright-results',
  use: {
    trace: 'retain-on-failure',
  },
})
