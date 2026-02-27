import { z } from 'zod';

const RepositoryUrlSchema = z
  .string()
  .regex(
    /^https?:\/\/(github\.com\/[^/]+\/[^/]+|gitlab\.com\/.+\/[^/]+)\/?$/,
    'Provide a valid GitHub or GitLab repository URL'
  );

const OutputFormatSchema = z.enum(['table', 'json', 'yaml', 'console']);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

const BooleanStringSchema = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    if (val === 'true') return true;
    if (val === 'false') return false;
    return val === 'true';
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
