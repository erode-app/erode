import { z } from 'zod';
import { existsSync } from 'fs';
import { ErodeError, ErrorCode } from '../errors.js';

export function validatePath(path: string, type: 'file' | 'directory' = 'directory'): void {
  if (!path) {
    throw new ErodeError(
      'Path is required',
      ErrorCode.INVALID_INPUT,
      'Invalid input: Path is required'
    );
  }
  if (!existsSync(path)) {
    const errorCode = type === 'file' ? ErrorCode.FILE_NOT_FOUND : ErrorCode.DIRECTORY_NOT_FOUND;
    const resourceType = type === 'file' ? 'File' : 'Directory';
    throw new ErodeError(
      `${resourceType} does not exist: ${path}`,
      errorCode,
      `${resourceType} not found: ${path}`,
      { path, type }
    );
  }
}
export function validate<T>(schema: z.ZodType<T>, data: unknown, fieldName?: string): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map(
          (issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`
        )
        .join(', ');
      throw new ErodeError(
        `Validation failed${fieldName ? ` for ${fieldName}` : ''}: ${issues}`,
        ErrorCode.INVALID_INPUT,
        `Invalid input: Validation failed${fieldName ? ` for ${fieldName}` : ''}: ${issues}`,
        { field: fieldName }
      );
    }
    throw error;
  }
}
