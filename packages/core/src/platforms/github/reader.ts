import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { CONFIG } from '../../utils/config.js';
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
import { applyDiffTruncation, wrapPlatformError } from '../platform-utils.js';
import { parseChangeRequestRef } from '../change-request-url.js';

export class GitHubReader implements SourcePlatformReader {
  private octokit: Octokit;

  constructor(token?: string) {
    const authToken = token ?? CONFIG.github.token;
    this.octokit = new Octokit({
      ...(authToken ? { auth: authToken } : {}),
      baseUrl: CONFIG.github.baseUrl,
    });
  }

  parseChangeRequestUrl(url: string): ChangeRequestRef {
    return parseChangeRequestRef(
      url,
      'github',
      'Cannot parse GitHub pull request URL. Expected format: https://github.com/{owner}/{repo}/pull/{number}'
    );
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

      const totalLines = files.reduce((sum, file) => sum + file.changes, 0);

      const {
        files: filesToInclude,
        wasTruncated,
        truncationReason,
      } = applyDiffTruncation(
        files.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch,
        })),
        totalLines
      );

      const { data: comparison } = await this.octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: pr.base.sha,
        head: pr.head.sha,
      });

      const diff =
        comparison.files
          ?.flatMap((file) =>
            file.patch ? [`diff --git a/${file.filename} b/${file.filename}\n${file.patch}`] : []
          )
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
        files: filesToInclude,
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
      wrapPlatformError(error, 'github', 'Could not retrieve pull request');
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
      const result = commits.map(({ sha, commit: { message, author } }) => ({
        sha,
        message,
        author: {
          name: author?.name ?? '(unknown)',
          email: author?.email ?? '',
        },
      }));
      return validate(z.array(ChangeRequestCommitSchema), result, 'GitHub change request commits');
    } catch (error) {
      wrapPlatformError(error, 'github', 'Could not retrieve pull request commits');
    }
  }
}
