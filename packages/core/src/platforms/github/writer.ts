import { Octokit } from '@octokit/rest';
import { CONFIG, ENV_VAR_NAMES, RC_FILENAME } from '../../utils/config.js';
import { ErodeError, ErrorCode } from '../../errors.js';
import { withRetry } from '../../utils/retry.js';
import type {
  SourcePlatformWriter,
  ChangeRequestRef,
  ChangeRequestResult,
  CreateOrUpdateChangeRequestOptions,
} from '../source-platform.js';
import { wrapPlatformError, isTransientError } from '../platform-utils.js';
import { extractStatusCode } from '../../utils/error-utils.js';

function throw403AsPermissionError(error: unknown, prNumber: number): void {
  if (error instanceof Error && extractStatusCode(error) === 403) {
    throw new ErodeError(
      'Cannot comment on PR: the conversation may be locked or the token lacks write access',
      ErrorCode.IO_PERMISSION_DENIED,
      'Cannot comment on PR. Check if the conversation is locked or if the token has issues:write permission.',
      { prNumber }
    );
  }
}

export class GitHubWriter implements SourcePlatformWriter {
  private readonly octokit: Octokit;
  private readonly targetOwner: string;
  private readonly targetRepo: string;

  constructor(targetOwner: string, targetRepo: string) {
    const token = CONFIG.github.modelRepoPrToken ?? CONFIG.github.token;
    if (!token) {
      throw new ErodeError(
        'A GitHub token is needed to create PRs',
        ErrorCode.AUTH_KEY_MISSING,
        `Provide ${ENV_VAR_NAMES.modelRepoPrToken} or ${ENV_VAR_NAMES.githubToken} in your environment or ${RC_FILENAME} to create PRs.`
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
      wrapPlatformError(error, 'github', 'Could not create or update pull request');
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
      await withRetry(
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
        { retries: 1, initialDelay: 2000, shouldRetry: isTransientError }
      );
    } catch (error) {
      throw403AsPermissionError(error, ref.number);
      wrapPlatformError(error, 'github', 'Could not comment on pull request');
    }
  }

  async deleteComment(ref: ChangeRequestRef, marker: string): Promise<void> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;

    try {
      await withRetry(
        async () => {
          const existingId = await this.findCommentByMarker(owner, repo, ref.number, marker);
          if (existingId) {
            await this.octokit.rest.issues.deleteComment({ owner, repo, comment_id: existingId });
          }
        },
        { retries: 1, initialDelay: 2000, shouldRetry: isTransientError }
      );
    } catch (error) {
      throw403AsPermissionError(error, ref.number);
      wrapPlatformError(error, 'github', 'Could not remove comment from pull request');
    }
  }

  async closeChangeRequest(branchName: string): Promise<void> {
    const owner = this.targetOwner;
    const repo = this.targetRepo;

    try {
      const { data: prs } = await this.octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${branchName}`,
        state: 'open',
      });

      const pr = prs[0];
      if (!pr) return;

      await this.octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pr.number,
        state: 'closed',
      });

      try {
        await this.octokit.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${branchName}`,
        });
      } catch {
        // Branch may already be deleted
      }
    } catch (error) {
      wrapPlatformError(error, 'github', 'Could not close pull request');
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
