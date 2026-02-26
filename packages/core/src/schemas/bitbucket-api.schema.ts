import { z } from 'zod';

export const BitbucketPrResponseSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    description: z.string().default(''),
    state: z.string(), // OPEN, MERGED, DECLINED, SUPERSEDED
    author: z
      .object({
        display_name: z.string(),
        nickname: z.string(),
      })
      .nullable(),
    source: z.object({
      branch: z.object({ name: z.string() }),
      commit: z.object({ hash: z.string() }),
    }),
    destination: z.object({
      branch: z.object({ name: z.string() }),
      commit: z.object({ hash: z.string() }),
    }),
  })
  .loose();

export const BitbucketDiffstatEntrySchema = z
  .object({
    status: z.string(), // added, removed, modified, renamed
    lines_added: z.number(),
    lines_removed: z.number(),
    old: z.object({ path: z.string() }).nullable(),
    new: z.object({ path: z.string() }).nullable(),
  })
  .loose();

export const BitbucketCommitEntrySchema = z
  .object({
    hash: z.string(),
    message: z.string(),
    author: z.object({
      raw: z.string(), // "Name <email>" format
    }),
  })
  .loose();

export const BitbucketCommentSchema = z
  .object({
    id: z.number(),
    content: z.object({
      raw: z.string(),
    }),
  })
  .loose();
