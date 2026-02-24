import { z } from 'zod';
import { existsSync } from 'fs';
import { ErodeError, ErrorCode } from '../errors.js';

const RepositoryUrlSchema = z
  .string()
  .regex(
    /^https?:\/\/(github\.com\/[^/]+\/[^/]+|gitlab\.com\/.+\/[^/]+)\/?$/,
    'Must be a valid GitHub or GitLab repository URL'
  );
const OutputFormatSchema = z.enum(['table', 'json', 'yaml', 'console']);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

// Helper to coerce string "true"/"false" to boolean (for CLI compatibility)
const BooleanStringSchema = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    if (val === 'true') return true;
    if (val === 'false') return false;
    return val === 'true'; // fallback
  })
  .pipe(z.boolean());

export const AnalyzeOptionsSchema = z.object({
  url: z.url(),
  modelFormat: z.string().default('likec4'),
  generateModel: z.boolean().optional(),
  outputFile: z.string().optional(),
  format: z.enum(['console', 'json']).optional().default('console'),
  openPr: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  draft: BooleanStringSchema.optional().default(true),
  skipFileFiltering: z.boolean().optional().default(false),
  comment: z.boolean().optional(),
  githubActions: z.boolean().optional(),
  failOnViolations: z.boolean().optional(),
});
export const ComponentsOptionsSchema = z.object({
  modelFormat: z.string().default('likec4'),
  format: OutputFormatSchema.default('table'),
});
export const ValidateOptionsSchema = z.object({
  modelFormat: z.string().default('likec4'),
  format: z.enum(['table', 'json']).default('table'),
});
export const ConnectionsOptionsSchema = z.object({
  modelFormat: z.string().default('likec4'),
  repo: RepositoryUrlSchema,
  output: z.enum(['console', 'json']).default('console'),
});
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
