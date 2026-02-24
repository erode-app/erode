import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import checkFile from 'eslint-plugin-check-file';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'check-file': checkFile,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      eqeqeq: ['error', 'smart'],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': ['error', { '**/src/**/': 'KEBAB_CASE' }],
    },
  },
  {
    files: ['**/__tests__/**'],
    rules: {
      'check-file/folder-naming-convention': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'oldversion/', 'eslint.config.mjs', 'vitest.config.ts'],
  }
);
