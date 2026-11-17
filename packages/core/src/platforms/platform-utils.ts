import type { ChangeRequestFile } from './source-platform.js';
import { CONFIG } from '../utils/config.js';
import { ErodeError, ApiError } from '../errors.js';
import { extractStatusCode } from '../utils/error-utils.js';

interface TruncationResult {
  files: ChangeRequestFile[];
  wasTruncated: boolean;
  truncationReason?: string;
}

function applyLineBudget(
  files: ChangeRequestFile[],
  maxLines: number
): { files: ChangeRequestFile[]; dropped: number; patchTrimmed: boolean } {
  const kept: ChangeRequestFile[] = [];
  let used = 0;
  let patchTrimmed = false;
  for (const file of files) {
    if (kept.length > 0 && used + file.changes > maxLines) break;
    if (kept.length === 0 && file.changes > maxLines && file.patch !== undefined) {
      // The first file always stays, but its patch is cut to the budget.
      kept.push({ ...file, patch: file.patch.split('\n').slice(0, maxLines).join('\n') });
      patchTrimmed = true;
    } else {
      kept.push(file);
    }
    used += file.changes;
  }
  return { files: kept, dropped: files.length - kept.length, patchTrimmed };
}

export function applyDiffTruncation(
  files: ChangeRequestFile[],
  totalLines: number
): TruncationResult {
  const { maxFilesPerDiff, maxLinesPerDiff } = CONFIG.constraints;
  const totalFiles = files.length;
  const reasons: string[] = [];
  let kept = files;

  if (totalFiles > maxFilesPerDiff) {
    kept = files.slice(0, maxFilesPerDiff);
    reasons.push(
      `Diff surpassed the ${String(maxFilesPerDiff)}-file limit (${String(totalFiles)} files found). Only the first ${String(maxFilesPerDiff)} files were analyzed.`
    );
  }
  if (totalLines > maxLinesPerDiff) {
    const budgeted = applyLineBudget(kept, maxLinesPerDiff);
    kept = budgeted.files;
    const header = `Diff surpassed the ${String(maxLinesPerDiff)}-line limit (${String(totalLines)} lines found).`;
    if (budgeted.dropped > 0 || budgeted.patchTrimmed) {
      reasons.push(
        `${header} ${String(budgeted.dropped)} ${budgeted.dropped === 1 ? 'file was' : 'files were'} dropped${budgeted.patchTrimmed ? ' and the first file was cut to fit' : ''}.`
      );
    } else {
      reasons.push(`${header} Analysis may be partial.`);
    }
  }

  if (reasons.length === 0) return { files, wasTruncated: false };
  return { files: kept, wasTruncated: true, truncationReason: reasons.join(' ') };
}

export function sanitizeErrorMessage(message: string): string {
  if (/<[a-z/!][^>]*>/i.test(message)) {
    let cleaned = message;
    let prev: string;
    do {
      prev = cleaned;
      cleaned = cleaned.replace(/<[^>]*>/g, '');
    } while (cleaned !== prev);
    return cleaned.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  return message;
}

export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = extractStatusCode(error);
  return status !== undefined && status >= 500;
}

export function wrapPlatformError(error: unknown, provider: string, operation: string): never {
  if (error instanceof ErodeError) throw error;
  if (error instanceof Error) {
    throw new ApiError(
      `${operation}: ${sanitizeErrorMessage(error.message)}`,
      extractStatusCode(error),
      { provider }
    );
  }
  throw error;
}
