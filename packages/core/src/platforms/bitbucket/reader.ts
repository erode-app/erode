import { z } from 'zod';
import type {
  SourcePlatformReader,
  ChangeRequestRef,
  ChangeRequestData,
  ChangeRequestCommit,
} from '../source-platform.js';
import { ErodeError, ErrorCode } from '../../errors.js';
import { validate } from '../../utils/validation.js';
import {
  ChangeRequestDataSchema,
  ChangeRequestCommitSchema,
} from '../../schemas/source-platform.schema.js';
import {
  BitbucketPrResponseSchema,
  BitbucketDiffstatEntrySchema,
  BitbucketCommitEntrySchema,
} from '../../schemas/bitbucket-api.schema.js';
import { BitbucketApiClient } from './api-client.js';
import { applyDiffTruncation, wrapPlatformError } from '../platform-utils.js';

const BITBUCKET_PR_URL_PATTERN =
  /^https?:\/\/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)$/i;

/** Parse "Name <email>" format used by Bitbucket commit authors. */
function parseAuthorRaw(raw: string): { name: string; email: string } {
  const match = /^(.+?)\s*<(.+?)>$/.exec(raw);
  if (match?.[1] && match[2]) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: raw || 'Unknown', email: 'unknown@example.com' };
}

export class BitbucketReader implements SourcePlatformReader {
  private api: BitbucketApiClient;

  constructor(token?: string) {
    this.api = new BitbucketApiClient(token);
  }

  parseChangeRequestUrl(url: string): ChangeRequestRef {
    const match = BITBUCKET_PR_URL_PATTERN.exec(url);
    if (!match) {
      throw new ErodeError(
        'Unrecognized Bitbucket pull request URL. Expected: https://bitbucket.org/{workspace}/{repo}/pull-requests/{number}',
        ErrorCode.INVALID_URL,
        'Unrecognized Bitbucket pull request URL. Expected: https://bitbucket.org/{workspace}/{repo}/pull-requests/{number}'
      );
    }
    const [, workspace, repoSlug, prNumber] = match;
    if (!workspace || !repoSlug || !prNumber) {
      throw new ErodeError(
        'Incomplete Bitbucket PR URL: workspace, repo, or pull request number is missing',
        ErrorCode.INVALID_URL,
        'Incomplete Bitbucket PR URL: workspace, repo, or pull request number is missing'
      );
    }
    return {
      number: parseInt(prNumber, 10),
      url,
      repositoryUrl: `https://bitbucket.org/${workspace}/${repoSlug}`,
      platformId: { owner: workspace, repo: repoSlug },
    };
  }

  async fetchChangeRequest(ref: ChangeRequestRef): Promise<ChangeRequestData> {
    const workspace = ref.platformId.owner;
    const repoSlug = ref.platformId.repo;
    const prId = ref.number;
    const basePath = `/repositories/${workspace}/${repoSlug}/pullrequests/${String(prId)}`;

    try {
      const pr = await this.api.request(basePath, BitbucketPrResponseSchema);

      const diffstatEntries = await this.api.paginate(
        `${basePath}/diffstat`,
        BitbucketDiffstatEntrySchema
      );

      const commitEntries = await this.api.paginate(
        `${basePath}/commits`,
        BitbucketCommitEntrySchema
      );

      const rawDiff = await this.api.requestText(`${basePath}/diff`);

      const files = diffstatEntries.map((entry) => ({
        filename: entry.new?.path ?? entry.old?.path ?? 'unknown',
        status: entry.status,
        additions: entry.lines_added,
        deletions: entry.lines_removed,
        changes: entry.lines_added + entry.lines_removed,
        patch: undefined, // Bitbucket diffstat doesn't include per-file patches
      }));

      const totalLines = files.reduce((sum, f) => sum + f.changes, 0);
      const {
        files: filesToInclude,
        wasTruncated,
        truncationReason,
      } = applyDiffTruncation(files, totalLines);

      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

      const result = {
        number: pr.id,
        title: pr.title,
        body: pr.description || null,
        state: pr.state.toLowerCase(),
        author: {
          login: pr.author?.nickname ?? 'unknown',
          name: pr.author?.display_name,
        },
        base: {
          ref: pr.destination.branch.name,
          sha: pr.destination.commit.hash,
        },
        head: {
          ref: pr.source.branch.name,
          sha: pr.source.commit.hash,
        },
        commits: commitEntries.length,
        additions: totalAdditions,
        deletions: totalDeletions,
        changed_files: diffstatEntries.length,
        files: filesToInclude,
        diff: rawDiff,
        stats: {
          total: totalAdditions + totalDeletions,
          additions: totalAdditions,
          deletions: totalDeletions,
        },
        wasTruncated,
        truncationReason,
      };
      return validate(ChangeRequestDataSchema, result, 'Bitbucket change request data');
    } catch (error) {
      wrapPlatformError(error, 'bitbucket', 'Could not retrieve pull request');
    }
  }

  async fetchChangeRequestCommits(ref: ChangeRequestRef): Promise<ChangeRequestCommit[]> {
    const workspace = ref.platformId.owner;
    const repoSlug = ref.platformId.repo;
    const prId = ref.number;
    const basePath = `/repositories/${workspace}/${repoSlug}/pullrequests/${String(prId)}`;

    try {
      const commits = await this.api.paginate(`${basePath}/commits`, BitbucketCommitEntrySchema);
      const result = commits.map((commit) => {
        const { name, email } = parseAuthorRaw(commit.author.raw);
        return {
          sha: commit.hash,
          message: commit.message,
          author: { name, email },
        };
      });
      return validate(
        z.array(ChangeRequestCommitSchema),
        result,
        'Bitbucket change request commits'
      );
    } catch (error) {
      wrapPlatformError(error, 'bitbucket', 'Could not retrieve pull request commits');
    }
  }
}
