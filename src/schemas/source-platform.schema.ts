import { z } from 'zod';

export const ChangeRequestFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  patch: z.string().optional(),
});

export const ChangeRequestCommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
  }),
});

export const ChangeRequestDataSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  author: z.object({
    login: z.string(),
    name: z.string().optional(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  commits: z.number(),
  additions: z.number(),
  deletions: z.number(),
  changed_files: z.number(),
  files: z.array(ChangeRequestFileSchema),
  diff: z.string(),
  stats: z.object({
    total: z.number(),
    additions: z.number(),
    deletions: z.number(),
  }),
  wasTruncated: z.boolean().optional(),
  truncationReason: z.string().optional(),
});
