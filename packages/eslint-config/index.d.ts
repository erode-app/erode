import type { Linter } from 'eslint';

export function createBaseConfig(tsconfigRootDir: string): Linter.Config[];
export const ignores: Linter.Config;
