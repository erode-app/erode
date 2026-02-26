import { z } from 'zod';
import { Gitlab } from '@gitbeaker/rest';
import { CONFIG } from '../../utils/config.js';
import { ErodeError, ErrorCode } from '../../errors.js';
import type {
  SourcePlatformReader,
  ChangeRequestRef,
  ChangeRequestData,
  ChangeRequestCommit,
} from '../source-platform.js';
import { validate } from '../../utils/validation.js';
import {
  GitLabMrResponseSchema,
  GitLabDiffEntrySchema,
  GitLabCommitEntrySchema,
} from '../../schemas/gitlab-api.schema.js';
import {
  ChangeRequestDataSchema,
  ChangeRequestCommitSchema,
} from '../../schemas/source-platform.schema.js';
import { applyDiffTruncation, wrapPlatformError } from '../platform-utils.js';

const GITLAB_MR_URL_PATTERN = /^https?:\/\/gitlab\.com\/(.+)\/-\/merge_requests\/(\d+)$/i;

export class GitLabReader implements SourcePlatformReader {
  private api: InstanceType<typeof Gitlab>;

  constructor(token?: string) {
    const authToken = token ?? CONFIG.gitlab.token;
    this.api = new Gitlab({
      ...(authToken ? { token: authToken } : {}),
      host: CONFIG.gitlab.baseUrl,
    });
  }

  parseChangeRequestUrl(url: string): ChangeRequestRef {
    const match = GITLAB_MR_URL_PATTERN.exec(url);
    if (!match) {
      throw new ErodeError(
        'Unrecognized GitLab merge request URL. Expected: https://gitlab.com/{namespace}/{project}/-/merge_requests/{number}',
        ErrorCode.INVALID_URL,
        'Unrecognized GitLab merge request URL. Expected: https://gitlab.com/{namespace}/{project}/-/merge_requests/{number}'
      );
    }
    const [, fullProjectPath, mrNumber] = match;
    if (!fullProjectPath || !mrNumber) {
      throw new ErodeError(
        'Incomplete GitLab MR URL: project path or merge request number is missing',
        ErrorCode.INVALID_URL,
        'Incomplete GitLab MR URL: project path or merge request number is missing'
      );
    }

    const lastSlashIndex = fullProjectPath.lastIndexOf('/');
    const owner = fullProjectPath.substring(0, lastSlashIndex);
    const repo = fullProjectPath.substring(lastSlashIndex + 1);

    return {
      number: parseInt(mrNumber, 10),
      url,
      repositoryUrl: `https://gitlab.com/${fullProjectPath}`,
      platformId: { owner, repo },
    };
  }

  async fetchChangeRequest(ref: ChangeRequestRef): Promise<ChangeRequestData> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;
    const projectPath = `${owner}/${repo}`;
    const mrIid = ref.number;

    try {
      const mr = validate(
        GitLabMrResponseSchema,
        await this.api.MergeRequests.show(projectPath, mrIid),
        'GitLab MR response'
      );
      const diffs = validate(
        z.array(GitLabDiffEntrySchema),
        await this.api.MergeRequests.allDiffs(projectPath, mrIid),
        'GitLab MR diffs'
      );

      const files = diffs.map((d) => {
        const diffStr = d.diff ?? '';
        const lines = diffStr.split('\n');
        const additions = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
        const deletions = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
        return {
          filename: d.new_path,
          status: d.new_file
            ? 'added'
            : d.deleted_file
              ? 'removed'
              : d.renamed_file
                ? 'renamed'
                : 'modified',
          additions,
          deletions,
          changes: additions + deletions,
          patch: diffStr || undefined,
        };
      });

      const totalLines = files.reduce((sum, f) => sum + f.changes, 0);

      const {
        files: filesToInclude,
        wasTruncated,
        truncationReason,
      } = applyDiffTruncation(files, totalLines);

      const diff = diffs
        .map((d) => {
          if (!d.diff) return '';
          return `diff --git a/${d.old_path} b/${d.new_path}\n${d.diff}`;
        })
        .filter(Boolean)
        .join('\n\n');

      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

      return validate(
        ChangeRequestDataSchema,
        {
          number: mr.iid,
          title: mr.title,
          body: mr.description ?? null,
          state: mr.state,
          author: {
            login: mr.author?.username ?? 'unknown',
            name: mr.author?.name,
          },
          base: {
            ref: mr.target_branch,
            sha: mr.diff_refs?.base_sha ?? '',
          },
          head: {
            ref: mr.source_branch,
            sha: mr.diff_refs?.head_sha ?? '',
          },
          commits: mr.commits_count,
          additions: totalAdditions,
          deletions: totalDeletions,
          changed_files: diffs.length,
          files: filesToInclude,
          diff,
          stats: {
            total: totalAdditions + totalDeletions,
            additions: totalAdditions,
            deletions: totalDeletions,
          },
          wasTruncated,
          truncationReason,
        },
        'GitLab change request data'
      );
    } catch (error) {
      wrapPlatformError(error, 'gitlab', 'Could not retrieve merge request');
    }
  }

  async fetchChangeRequestCommits(ref: ChangeRequestRef): Promise<ChangeRequestCommit[]> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;
    const projectPath = `${owner}/${repo}`;
    const mrIid = ref.number;

    try {
      const commits = validate(
        z.array(GitLabCommitEntrySchema),
        await this.api.MergeRequests.allCommits(projectPath, mrIid),
        'GitLab MR commits'
      );
      const result = commits.map((commit) => ({
        sha: commit.id,
        message: commit.message,
        author: {
          name: commit.author_name ?? 'Unknown',
          email: commit.author_email ?? 'unknown@example.com',
        },
      }));
      return validate(z.array(ChangeRequestCommitSchema), result, 'GitLab change request commits');
    } catch (error) {
      wrapPlatformError(error, 'gitlab', 'Could not retrieve merge request commits');
    }
  }
}
