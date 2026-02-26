import type { ChangeRequestFile } from './source-platform.js';
import { CONFIG } from '../utils/config.js';
import { ErodeError, ApiError } from '../errors.js';
import { extractStatusCode } from '../utils/error-utils.js';

interface TruncationResult {
  files: ChangeRequestFile[];
  wasTruncated: boolean;
  truncationReason?: string;
}

export function applyDiffTruncation(
  files: ChangeRequestFile[],
  totalLines: number
): TruncationResult {
  const totalFiles = files.length;

  if (totalFiles > CONFIG.constraints.maxFilesPerDiff) {
    return {
      files: files.slice(0, CONFIG.constraints.maxFilesPerDiff),
      wasTruncated: true,
      truncationReason: `Diff surpassed the ${String(CONFIG.constraints.maxFilesPerDiff)}-file limit (${String(totalFiles)} files found). Only the first ${String(CONFIG.constraints.maxFilesPerDiff)} files were analyzed.`,
    };
  }
  if (totalLines > CONFIG.constraints.maxLinesPerDiff) {
    return {
      files,
      wasTruncated: true,
      truncationReason: `Diff surpassed the ${String(CONFIG.constraints.maxLinesPerDiff)}-line limit (${String(totalLines)} lines found). Analysis may be partial.`,
    };
  }
  return { files, wasTruncated: false };
}

export function sanitizeErrorMessage(message: string): string {
  if (message.includes('<!DOCTYPE') || message.includes('<html')) {
    return message
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
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
