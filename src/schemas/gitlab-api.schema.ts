import { z } from 'zod';

export const GitLabMrResponseSchema = z
  .object({
    iid: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    state: z.string(),
    author: z.object({ username: z.string(), name: z.string() }).nullable(),
    target_branch: z.string(),
    source_branch: z.string(),
    diff_refs: z.object({ base_sha: z.string(), head_sha: z.string() }).nullable(),
    commits_count: z.number(),
  })
  .loose();

export const GitLabDiffEntrySchema = z
  .object({
    old_path: z.string(),
    new_path: z.string(),
    diff: z.string().nullable(),
    new_file: z.boolean(),
    deleted_file: z.boolean(),
    renamed_file: z.boolean(),
  })
  .loose();

export const GitLabCommitEntrySchema = z
  .object({
    id: z.string(),
    message: z.string(),
    author_name: z.string().nullable(),
    author_email: z.string().nullable(),
  })
  .loose();
