import { defineConfig } from 'vitest/config';

// Unit and server tests (tests/). Browser tests live in e2e/ and run with Playwright instead.
export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify('test') },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/store/**', 'netlify/**'],
      exclude: ['**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
