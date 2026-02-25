import { createBaseConfig, ignores } from '@erode/eslint-config';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';

export default [
  ignores,
  ...createBaseConfig(import.meta.dirname),

  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooks.configs.flat['recommended-latest'],
  reactYouMightNotNeedAnEffect.configs.recommended,

  {
    settings: { react: { version: 'detect' } },
  },

  {
    files: ['**/*.{tsx,jsx}'],
    rules: {
      'react/prop-types': 'off',
    },
  },

  { ignores: ['eslint.config.mjs', 'vitest.config.ts'] },
];
