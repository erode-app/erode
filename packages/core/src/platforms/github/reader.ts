import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { CONFIG } from '../../utils/config.js';
import { ErodeError, ApiError, ErrorCode } from '../../errors.js';
import type {
  SourcePlatformReader,
  ChangeRequestRef,
  ChangeRequestData,
  ChangeRequestCommit,
} from '../source-platform.js';
import { validate } from '../../utils/validation.js';
import {
  ChangeRequestDataSchema,
  ChangeRequestCommitSchema,
} from '../../schemas/source-platform.schema.js';

const GITHUB_PR_URL_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/i;

export class GitHubReader implements SourcePlatformReader {
  private octokit: Octokit;

  constructor(token?: string) {
    const authToken = token ?? CONFIG.github.token;
    this.octokit = new Octokit({
      ...(authToken ? { auth: authToken } : {}),
    });
  }

  parseChangeRequestUrl(url: string): ChangeRequestRef {
    const match = GITHUB_PR_URL_PATTERN.exec(url);
    if (!match) {
      throw new ErodeError(
        'Unrecognized GitHub pull request URL. Expected: https://github.com/{owner}/{repo}/pull/{number}',
        ErrorCode.INVALID_URL,
        'Unrecognized GitHub pull request URL. Expected: https://github.com/{owner}/{repo}/pull/{number}'
      );
    }
    const [, owner, repo, prNumber] = match;
    if (!owner || !repo || !prNumber) {
      throw new ErodeError(
        'Incomplete GitHub PR URL: owner, repo, or pull request number is missing',
        ErrorCode.INVALID_URL,
        'Incomplete GitHub PR URL: owner, repo, or pull request number is missing'
      );
    }
    return {
      number: parseInt(prNumber, 10),
      url,
      repositoryUrl: `https://github.com/${owner}/${repo}`,
      platformId: { owner, repo },
    };
  }

  async fetchChangeRequest(ref: ChangeRequestRef): Promise<ChangeRequestData> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;
    const pull_number = ref.number;

    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });

      const { data: files } = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number,
        per_page: 100,
      });

      const totalFiles = files.length;
      const totalLines = files.reduce((sum, file) => sum + file.changes, 0);

      let wasTruncated = false;
      let truncationReason: string | undefined;
      let filesToInclude = files;

      if (totalFiles > CONFIG.constraints.maxFilesPerDiff) {
        wasTruncated = true;
        truncationReason = `Diff surpassed the ${String(CONFIG.constraints.maxFilesPerDiff)}-file limit (${String(totalFiles)} files found). Only the first ${String(CONFIG.constraints.maxFilesPerDiff)} files were analyzed.`;
        filesToInclude = files.slice(0, CONFIG.constraints.maxFilesPerDiff);
      } else if (totalLines > CONFIG.constraints.maxLinesPerDiff) {
        wasTruncated = true;
        truncationReason = `Diff surpassed the ${String(CONFIG.constraints.maxLinesPerDiff)}-line limit (${String(totalLines)} lines found). Analysis may be partial.`;
      }

      const { data: comparison } = await this.octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: pr.base.sha,
        head: pr.head.sha,
      });

      const diff =
        comparison.files
          ?.map((file) => {
            if (!file.patch) return '';
            return `diff --git a/${file.filename} b/${file.filename}\n${file.patch}`;
          })
          .filter(Boolean)
          .join('\n\n') ?? '';

      const result = {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        author: {
          login: pr.user.login,
          name: pr.user.name ?? undefined,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
        },
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
        },
        commits: pr.commits,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        files: filesToInclude.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch,
        })),
        diff,
        stats: {
          total: pr.additions + pr.deletions,
          additions: pr.additions,
          deletions: pr.deletions,
        },
        wasTruncated,
        truncationReason,
      };
      return validate(ChangeRequestDataSchema, result, 'GitHub change request data');
    } catch (error) {
      if (error instanceof ErodeError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new ApiError(`Could not retrieve pull request: ${error.message}`, undefined, {
          provider: 'github',
        });
      }
      throw error;
    }
  }

  async fetchChangeRequestCommits(ref: ChangeRequestRef): Promise<ChangeRequestCommit[]> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;
    const pull_number = ref.number;

    try {
      const { data: commits } = await this.octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number,
        per_page: 100,
      });
      const result = commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author?.name ?? 'Unknown',
          email: commit.commit.author?.email ?? 'unknown@example.com',
        },
      }));
      return validate(z.array(ChangeRequestCommitSchema), result, 'GitHub change request commits');
    } catch (error) {
      if (error instanceof ErodeError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new ApiError(`Could not retrieve pull request commits: ${error.message}`, undefined, {
          provider: 'github',
        });
      }
      throw error;
    }
  }
}
