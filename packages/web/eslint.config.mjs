import { createBaseConfig, disableTypeChecked, ignores } from '@erode-app/eslint-config';
import eslintPluginAstro from 'eslint-plugin-astro';

export default [
  ignores,
  ...createBaseConfig(import.meta.dirname),
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['**/*.astro'],
    ...disableTypeChecked,
  },
  {
    ignores: ['astro.config.mjs', '.astro/', 'src/content/', 'public/architecture/'],
  },
];
