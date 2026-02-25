import { Gitlab } from '@gitbeaker/rest';
import { CONFIG } from '../../utils/config.js';
import { ApiError, ErodeError, ErrorCode } from '../../errors.js';
import type {
  SourcePlatformWriter,
  ChangeRequestRef,
  ChangeRequestResult,
  CreateOrUpdateChangeRequestOptions,
} from '../source-platform.js';

/** Subset of the GitLab MR response fields we access. */
interface GitLabMrResponse {
  iid: number;
  web_url: string;
}

export class GitLabWriter implements SourcePlatformWriter {
  private readonly api: InstanceType<typeof Gitlab>;
  private readonly projectPath: string;

  constructor(targetOwner: string, targetRepo: string) {
    const token = CONFIG.gitlab.token;
    if (!token) {
      throw new ErodeError(
        'A GitLab token is needed to create merge requests',
        ErrorCode.MISSING_API_KEY,
        'Provide GITLAB_TOKEN to create merge requests.'
      );
    }
    this.api = new Gitlab({ token, host: CONFIG.gitlab.baseUrl });
    this.projectPath = `${targetOwner}/${targetRepo}`;
  }

  async createOrUpdateChangeRequest(
    options: CreateOrUpdateChangeRequestOptions
  ): Promise<ChangeRequestResult> {
    try {
      const { branchName, title, body, fileChanges, baseBranch = 'main', draft = true } = options;

      let branchExists = false;
      try {
        await this.api.Branches.show(this.projectPath, branchName);
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      if (!branchExists) {
        await this.api.Branches.create(this.projectPath, branchName, baseBranch);
      }

      // Create commit with file changes.
      // On a new branch, files don't exist yet → 'create'.
      // On an existing branch, erode overwrites the same files → 'update'.
      // Mixed scenarios (some new, some existing) are not supported by this batch approach.
      if (fileChanges.length > 0) {
        const actions = fileChanges.map((file) => ({
          action: branchExists ? ('update' as const) : ('create' as const),
          filePath: file.path,
          content: file.content,
        }));

        await this.api.Commits.create(this.projectPath, branchName, title, actions);
      }

      const existingMrs = (await this.api.MergeRequests.all({
        projectId: this.projectPath,
        sourceBranch: branchName,
        state: 'opened',
      })) as unknown as GitLabMrResponse[];

      const existingMr = existingMrs[0];
      if (existingMr) {
        await this.api.MergeRequests.edit(this.projectPath, existingMr.iid, {
          title,
          description: body,
        });
        return {
          url: existingMr.web_url,
          number: existingMr.iid,
          action: 'updated',
          branch: branchName,
        };
      }

      // Create new MR — prefix title with "Draft: " for draft MRs
      const mrTitle = draft ? `Draft: ${title}` : title;
      const mr = (await this.api.MergeRequests.create(
        this.projectPath,
        branchName,
        baseBranch,
        mrTitle,
        { description: body }
      )) as unknown as GitLabMrResponse;

      return {
        url: mr.web_url,
        number: mr.iid,
        action: 'created',
        branch: branchName,
      };
    } catch (error) {
      if (error instanceof ErodeError) throw error;
      if (error instanceof Error) {
        throw new ApiError(
          `Could not create or update merge request: ${error.message}`,
          undefined,
          {
            provider: 'gitlab',
          }
        );
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
    const projectPath = `${owner}/${repo}`;

    try {
      if (options?.upsertMarker) {
        const existingId = await this.findNoteByMarker(
          projectPath,
          ref.number,
          options.upsertMarker
        );
        if (existingId) {
          await this.api.MergeRequestNotes.edit(projectPath, ref.number, existingId, { body });
          return;
        }
      }
      await this.api.MergeRequestNotes.create(projectPath, ref.number, body);
    } catch (error) {
      if (error instanceof ErodeError) throw error;
      if (error instanceof Error) {
        throw new ApiError(`Could not comment on merge request: ${error.message}`, undefined, {
          provider: 'gitlab',
        });
      }
      throw error;
    }
  }

  async deleteComment(ref: ChangeRequestRef, marker: string): Promise<void> {
    const owner = ref.platformId.owner;
    const repo = ref.platformId.repo;
    const projectPath = `${owner}/${repo}`;

    try {
      const existingId = await this.findNoteByMarker(projectPath, ref.number, marker);
      if (existingId) {
        await this.api.MergeRequestNotes.remove(projectPath, ref.number, existingId);
      }
    } catch (error) {
      if (error instanceof ErodeError) throw error;
      if (error instanceof Error) {
        throw new ApiError(
          `Could not remove comment from merge request: ${error.message}`,
          undefined,
          { provider: 'gitlab' }
        );
      }
      throw error;
    }
  }

  private async findNoteByMarker(
    projectPath: string,
    mrIid: number,
    marker: string
  ): Promise<number | undefined> {
    const notes = (await this.api.MergeRequestNotes.all(projectPath, mrIid)) as unknown as {
      id: number;
      body: string;
    }[];
    const match = notes.find((n) => n.body.includes(marker));
    return match?.id;
  }
}
