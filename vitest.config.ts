import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DEBUG_MODE: 'true',
    },
    exclude: ['oldversion/**', 'dist/**', 'node_modules/**'],
  },
});
