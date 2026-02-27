import { z } from 'zod';
import { CONFIG } from '../../utils/config.js';
import { ErodeError, ErrorCode } from '../../errors.js';
import type {
  SourcePlatformWriter,
  ChangeRequestRef,
  ChangeRequestResult,
  CreateOrUpdateChangeRequestOptions,
} from '../source-platform.js';
import { BitbucketCommentSchema } from '../../schemas/bitbucket-api.schema.js';
import { BitbucketApiClient } from './api-client.js';
import { wrapPlatformError } from '../platform-utils.js';

const BitbucketPrWriteResponseSchema = z
  .object({
    id: z.number(),
    links: z.object({
      html: z.object({ href: z.string() }),
    }),
  })
  .loose();

const BitbucketPrListResponseSchema = z
  .object({
    values: z.array(BitbucketPrWriteResponseSchema),
  })
  .loose();

export class BitbucketWriter implements SourcePlatformWriter {
  private readonly api: BitbucketApiClient;
  private readonly workspace: string;
  private readonly repoSlug: string;

  constructor(targetOwner: string, targetRepo: string) {
    const token = CONFIG.bitbucket.token;
    if (!token) {
      throw new ErodeError(
        'A Bitbucket token is needed to create pull requests',
        ErrorCode.AUTH_KEY_MISSING,
        'Provide BITBUCKET_TOKEN to create pull requests.'
      );
    }
    this.api = new BitbucketApiClient(token);
    this.workspace = targetOwner;
    this.repoSlug = targetRepo;
  }

  async createOrUpdateChangeRequest(
    options: CreateOrUpdateChangeRequestOptions
  ): Promise<ChangeRequestResult> {
    try {
      const { branchName, title, body, fileChanges, baseBranch = 'main' } = options;
      // Bitbucket has no native draft PRs — the draft option is ignored.
      const repoPath = `/repositories/${this.workspace}/${this.repoSlug}`;

      // Check if branch exists
      let branchExists = false;
      try {
        await this.api.requestVoid(`${repoPath}/refs/branches/${encodeURIComponent(branchName)}`);
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      if (!branchExists) {
        // Get the base branch hash to use as the new branch target
        const baseBranchInfo = await this.api.request(
          `${repoPath}/refs/branches/${encodeURIComponent(baseBranch)}`,
          z.object({ target: z.object({ hash: z.string() }) }).loose()
        );
        await this.api.requestVoid(`${repoPath}/refs/branches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: branchName,
            target: { hash: baseBranchInfo.target.hash },
          }),
        });
      }

      // Commit files via the source endpoint (multipart form data)
      if (fileChanges.length > 0) {
        const formData = new FormData();
        formData.append('branch', branchName);
        formData.append('message', title);
        for (const file of fileChanges) {
          formData.append(file.path, new Blob([file.content], { type: 'text/plain' }), file.path);
        }
        await this.api.requestVoid(`${repoPath}/src`, {
          method: 'POST',
          body: formData,
        });
      }

      // Check for an existing open PR from this branch
      const existingPrs = await this.api.request(
        `${repoPath}/pullrequests?q=${encodeURIComponent(`source.branch.name="${branchName}" AND state="OPEN"`)}`,
        BitbucketPrListResponseSchema
      );

      const existingPr = existingPrs.values[0];
      if (existingPr) {
        await this.api.request(
          `${repoPath}/pullrequests/${String(existingPr.id)}`,
          BitbucketPrWriteResponseSchema,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description: body }),
          }
        );
        return {
          url: existingPr.links.html.href,
          number: existingPr.id,
          action: 'updated',
          branch: branchName,
        };
      }

      // Create a new PR
      const pr = await this.api.request(
        `${repoPath}/pullrequests`,
        BitbucketPrWriteResponseSchema,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description: body,
            source: { branch: { name: branchName } },
            destination: { branch: { name: baseBranch } },
            close_source_branch: true,
          }),
        }
      );

      return {
        url: pr.links.html.href,
        number: pr.id,
        action: 'created',
        branch: branchName,
      };
    } catch (error) {
      wrapPlatformError(error, 'bitbucket', 'Could not create or update pull request');
    }
  }

  async commentOnChangeRequest(
    ref: ChangeRequestRef,
    body: string,
    options?: { upsertMarker?: string }
  ): Promise<void> {
    const basePath = `/repositories/${ref.platformId.owner}/${ref.platformId.repo}/pullrequests/${String(ref.number)}`;

    try {
      if (options?.upsertMarker) {
        const existingId = await this.findCommentByMarker(basePath, options.upsertMarker);
        if (existingId) {
          await this.api.requestVoid(`${basePath}/comments/${String(existingId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: { raw: body } }),
          });
          return;
        }
      }
      await this.api.requestVoid(`${basePath}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { raw: body } }),
      });
    } catch (error) {
      wrapPlatformError(error, 'bitbucket', 'Could not comment on pull request');
    }
  }

  async deleteComment(ref: ChangeRequestRef, marker: string): Promise<void> {
    const basePath = `/repositories/${ref.platformId.owner}/${ref.platformId.repo}/pullrequests/${String(ref.number)}`;

    try {
      const existingId = await this.findCommentByMarker(basePath, marker);
      if (existingId) {
        await this.api.requestVoid(`${basePath}/comments/${String(existingId)}`, {
          method: 'DELETE',
        });
      }
    } catch (error) {
      wrapPlatformError(error, 'bitbucket', 'Could not remove comment from pull request');
    }
  }

  private async findCommentByMarker(basePath: string, marker: string): Promise<number | undefined> {
    const comments = await this.api.paginate(`${basePath}/comments`, BitbucketCommentSchema);
    const match = comments.find((c) => c.content.raw.includes(marker));
    return match?.id;
  }
}
