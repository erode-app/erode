import { z } from 'zod';
import { isRepositoryHostUrl, parseRepoLocator, stripUrlUserinfo } from '@erode-app/core';

const RepositoryUrlSchema = z
  .string()
  .transform(stripUrlUserinfo)
  .pipe(
    z
      .string()
      .refine(
        isRepositoryHostUrl,
        'Provide a repository URL on GitHub, GitLab, Bitbucket, Azure DevOps, or a configured self-hosted host'
      )
  );

const RepositoryLocationSchema = z
  .string()
  .transform(stripUrlUserinfo)
  .pipe(
    z
      .string()
      .refine(
        (value) => parseRepoLocator(value) !== null,
        'Provide a repository URL or git remote (https://host/owner/repo or git@host:owner/repo.git)'
      )
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
  outputFile: z.string().optional(),
  format: z.enum(['console', 'json']).optional().default('console'),
  openPr: z.boolean().optional(),
  modelRepo: z.string().optional(),
  modelRef: z.string().optional(),
  patchLocal: z.boolean().optional(),
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

export const CheckOptionsSchema = z.object({
  repo: RepositoryLocationSchema.optional(),
  modelFormat: z.string().default('likec4'),
  staged: z.boolean().optional().default(false),
  branch: z
    .string()
    .regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid branch name')
    .optional(),
  component: z.string().optional(),
  format: z.enum(['console', 'json']).optional().default('console'),
  failOnViolations: z.boolean().optional().default(false),
  skipFileFiltering: z.boolean().optional().default(false),
  modelRepo: z.string().optional(),
  modelRef: z.string().optional(),
});
