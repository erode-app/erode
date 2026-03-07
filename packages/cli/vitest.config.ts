import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      ERODE_DEBUG_MODE: 'true',
    },
    exclude: ['dist/**', 'node_modules/**'],
    passWithNoTests: true,
  },
});
