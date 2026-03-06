import { createBaseConfig, ignores } from '@erode-app/eslint-config';

export default [
  ignores,
  ...createBaseConfig(import.meta.dirname),
  { ignores: ['eslint.config.mjs', 'vitest.config.ts', 'scripts/**'] },
];
