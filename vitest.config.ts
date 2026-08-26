import { defineConfig } from 'vitest/config';

// Root Vitest config. Client tests run in jsdom; server/shared tests in node.
// Per-file environment is selected via the `// @vitest-environment` comment or
// the environmentMatchGlobs below.
export default defineConfig({
  test: {
    globals: true,
    environmentMatchGlobs: [
      ['client/**', 'jsdom'],
      ['server/**', 'node'],
      ['shared/**', 'node'],
    ],
    include: ['{client,server,shared}/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['client/src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['client/src/**', 'server/src/**', 'shared/src/**'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/test/**', 'client/src/main.tsx'],
    },
  },
});
