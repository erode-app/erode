import { Octokit } from '@octokit/rest';
import { CONFIG } from '../../utils/config.js';
import { ApiError, ErodeError, ErrorCode } from '../../errors.js';
import { ErrorHandler } from '../../utils/error-handler.js';
import type {
  SourcePlatformWriter,
  ChangeRequestRef,
  ChangeRequestResult,
  CreateOrUpdateChangeRequestOptions,
} from '../source-platform.js';

function isTransientError(error: unknown): boolean {
  const status =
    error instanceof Error && 'status' in error ? (error as { status: unknown }).status : undefined;
  return typeof status === 'number' && status >= 500;
}

function sanitizeErrorMessage(message: string): string {
  if (message.includes('<!DOCTYPE') || message.includes('<html')) {
    return message
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }
  return message;
}

function extractStatusCode(error: Error): number | undefined {
  return 'status' in error && typeof (error as { status: unknown }).status === 'number'
    ? (error as { status: number }).status
    : undefined;
}

export class GitHubWriter implements SourcePlatformWriter {
  private readonly octokit: Octokit;
  private readonly targetOwner: string;
  private readonly targetRepo: string;

  constructor(targetOwner: string, targetRepo: string) {
    const token = CONFIG.github.modelRepoPrToken ?? CONFIG.github.token;
    if (!token) {
      throw new ErodeError(
        'GitHub token is required for PR creation',
        ErrorCode.MISSING_API_KEY,
        'Set MODEL_REPO_PR_TOKEN or GITHUB_TOKEN to create PRs.'
      );
    }
    this.octokit = new Octokit({ auth: token });
    this.targetOwner = targetOwner;
    this.targetRepo = targetRepo;
  }

  async createOrUpdateChangeRequest(
    options: CreateOrUpdateChangeRequestOptions
  ): Promise<ChangeRequestResult> {
    try {
      const { branchName, title, body, fileChanges, baseBranch = 'main', draft = true } = options;
      const owner = this.targetOwner;
      const repo = this.targetRepo;

      const { data: baseRef } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      const baseSha = baseRef.object.sha;

      const { data: baseCommit } = await this.octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: baseSha,
      });

      const treeItems = await Promise.all(
        fileChanges.map(async (file) => {
          const { data: blob } = await this.octokit.rest.git.createBlob({
            owner,
            repo,
            content: file.content,
            encoding: 'utf-8',
          });
          return {
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha,
          };
        })
      );

      const { data: tree } = await this.octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: baseCommit.tree.sha,
        tree: treeItems,
      });

      const { data: newCommit } = await this.octokit.rest.git.createCommit({
        owner,
        repo,
        message: title,
        tree: tree.sha,
        parents: [baseSha],
      });

      let branchExists = false;
      try {
        await this.octokit.rest.git.getRef({ owner, repo, ref: `heads/${branchName}` });
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      if (branchExists) {
        await this.octokit.rest.git.updateRef({
          owner,
          repo,
          ref: `heads/${branchName}`,
          sha: newCommit.sha,
          force: true,
        });
      } else {
        await this.octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha: newCommit.sha,
        });
      }

      const { data: existingPrs } = await this.octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${branchName}`,
        state: 'open',
      });

      const existingPr = existingPrs[0];
      if (existingPr) {
        await this.octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: existingPr.number,
          title,
          body,
        });
        return {
          url: existingPr.html_url,
          number: existingPr.number,
          action: 'updated',
          branch: branchName,
        };
      }

      const { data: pr } = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head: branchName,
        base: baseBranch,
        draft,
      });

      return {
        url: pr.html_url,
        number: pr.number,
        action: 'created',
        branch: branchName,
      };
    } catch (error) {
      if (error instanceof ErodeError) throw error;
      if (error instanceof Error) {
        throw new ApiError(`Failed to create/update pull request: ${error.message}`, undefined, {
          provider: 'github',
        });
      }
      throw error;
    }
  }

  async commentOnChangeRequest(
    ref: ChangeRequestRef,
    body: string,
    options?: { upsertMarker?: string }
  ): Promise<void> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;

    try {
      await ErrorHandler.withRetry(
        async () => {
          if (options?.upsertMarker) {
            const existingId = await this.findCommentByMarker(
              owner,
              repo,
              ref.number,
              options.upsertMarker
            );
            if (existingId) {
              await this.octokit.rest.issues.updateComment({
                owner,
                repo,
                comment_id: existingId,
                body,
              });
              return;
            }
          }
          await this.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: ref.number,
            body,
          });
        },
        { maxAttempts: 2, baseDelay: 2000, shouldRetry: isTransientError }
      );
    } catch (error) {
      if (error instanceof ErodeError) throw error;
      if (error instanceof Error) {
        throw new ApiError(
          `Failed to comment on pull request: ${sanitizeErrorMessage(error.message)}`,
          extractStatusCode(error),
          { provider: 'github' }
        );
      }
      throw error;
    }
  }

  async deleteComment(ref: ChangeRequestRef, marker: string): Promise<void> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;

    try {
      await ErrorHandler.withRetry(
        async () => {
          const existingId = await this.findCommentByMarker(owner, repo, ref.number, marker);
          if (existingId) {
            await this.octokit.rest.issues.deleteComment({ owner, repo, comment_id: existingId });
          }
        },
        { maxAttempts: 2, baseDelay: 2000, shouldRetry: isTransientError }
      );
    } catch (error) {
      if (error instanceof ErodeError) throw error;
      if (error instanceof Error) {
        throw new ApiError(
          `Failed to delete comment on pull request: ${sanitizeErrorMessage(error.message)}`,
          extractStatusCode(error),
          { provider: 'github' }
        );
      }
      throw error;
    }
  }

  private async findCommentByMarker(
    owner: string,
    repo: string,
    issueNumber: number,
    marker: string
  ): Promise<number | undefined> {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
    });
    const match = comments.find((c) => c.body?.includes(marker));
    return match?.id;
  }
}
