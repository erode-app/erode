import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { minimatch } from 'minimatch';
import { validate } from './validation.js';
import type { ChangeRequestFile } from '../platforms/source-platform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_SKIP_PATTERNS_PATH = join(__dirname, '..', 'skip-patterns');

export function loadSkipPatterns(filePath: string = DEFAULT_SKIP_PATTERNS_PATH): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const patterns = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return validate(z.array(z.string().min(1)), patterns, 'skip patterns');
}

export function applySkipPatterns(
  files: ChangeRequestFile[],
  patterns: string[]
): { included: ChangeRequestFile[]; excluded: number } {
  if (patterns.length === 0) {
    return { included: files, excluded: 0 };
  }

  const included: ChangeRequestFile[] = [];
  let excluded = 0;

  for (const file of files) {
    const shouldSkip = patterns.some((pattern) => minimatch(file.filename, pattern));
    if (shouldSkip) {
      excluded++;
    } else {
      included.push(file);
    }
  }

  return { included, excluded };
}
