import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      ERODE_DEBUG_MODE: 'true',
    },
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/index.ts', 'src/**/*.d.ts'],
    },
  },
});
