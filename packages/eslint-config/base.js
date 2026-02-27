import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import checkFile from 'eslint-plugin-check-file';

export function createBaseConfig(tsconfigRootDir) {
  return tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    prettier,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      plugins: { 'check-file': checkFile },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        eqeqeq: ['error', 'smart'],
        'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
        'check-file/filename-naming-convention': [
          'error',
          { '**/*.{ts,tsx,astro}': 'KEBAB_CASE' },
          { ignoreMiddleExtensions: true },
        ],
        'check-file/folder-naming-convention': ['error', { '**/src/**/': 'KEBAB_CASE' }],
      },
    },
    {
      files: ['**/__tests__/**'],
      rules: { 'check-file/folder-naming-convention': 'off' },
    }
  );
}

export const ignores = {
  ignores: ['dist/', 'node_modules/'],
};
