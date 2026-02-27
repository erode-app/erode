import type { z } from 'zod';
import { accessSync, statSync, constants as fsConstants } from 'fs';
import { ErodeError, ErrorCode } from '../errors.js';

export function validatePath(path: string, type: 'file' | 'directory' = 'directory'): void {
  if (!path) {
    throw new ErodeError(
      'Path argument is required',
      ErrorCode.INPUT_INVALID,
      'A valid path must be provided'
    );
  }

  try {
    accessSync(path, fsConstants.R_OK);
  } catch {
    const errorCode = type === 'file' ? ErrorCode.IO_FILE_NOT_FOUND : ErrorCode.IO_DIR_NOT_FOUND;
    const label = type === 'file' ? 'File' : 'Directory';
    throw new ErodeError(
      `${label} is not accessible: ${path}`,
      errorCode,
      `Cannot access ${label.toLowerCase()}: ${path}`,
      { path, type }
    );
  }

  // Verify the path matches the expected type
  const stats = statSync(path);
  if (type === 'file' && !stats.isFile()) {
    throw new ErodeError(
      `Path is not a file: ${path}`,
      ErrorCode.IO_FILE_NOT_FOUND,
      `Expected a file but found a directory: ${path}`,
      { path, type }
    );
  }
  if (type === 'directory' && !stats.isDirectory()) {
    throw new ErodeError(
      `Path is not a directory: ${path}`,
      ErrorCode.IO_DIR_NOT_FOUND,
      `Expected a directory but found a file: ${path}`,
      { path, type }
    );
  }
}

export function validate<T>(schema: z.ZodType<T>, data: unknown, fieldName?: string): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue, idx) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  ${String(idx + 1)}. [${path}] ${issue.message}`;
    })
    .join('\n');

  throw new ErodeError(
    `Validation failed${fieldName ? ` for ${fieldName}` : ''}:\n${issues}`,
    ErrorCode.INPUT_INVALID,
    `Invalid data${fieldName ? ` in ${fieldName}` : ''}: ${String(result.error.issues.length)} issue(s) found`,
    { field: fieldName }
  );
}
