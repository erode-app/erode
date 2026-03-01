import { createPlatformWriter } from '../platforms/platform-factory.js';
import type { ChangeRequestFileWrite } from '../platforms/source-platform.js';
import type { AdapterMetadata } from '../adapters/adapter-metadata.js';

export function modelPrBranchName(prNumber: number): string {
  return `erode/pr-${String(prNumber)}`;
}

export interface CreateModelPrOptions {
  repositoryUrl: string;
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  adapterMetadata: AdapterMetadata;
  fileChanges: ChangeRequestFileWrite[];
  body: string;
  draft?: boolean;
}

export interface CreateModelPrResult {
  url: string;
  number: number;
  action: 'created' | 'updated';
  branch: string;
}

export async function createModelPr(options: CreateModelPrOptions): Promise<CreateModelPrResult> {
  const writer = createPlatformWriter(options.repositoryUrl, options.owner, options.repo);
  const branchName = modelPrBranchName(options.prNumber);
  const prTitle = options.adapterMetadata.prTitleTemplate.replace(
    '{{prNumber}}',
    String(options.prNumber)
  );
  const prResult = await writer.createOrUpdateChangeRequest({
    branchName,
    title: prTitle,
    body: options.body,
    fileChanges: options.fileChanges,
    draft: options.draft,
  });
  return { ...prResult, branch: branchName };
}

export async function closeModelPr(options: {
  repositoryUrl: string;
  owner: string;
  repo: string;
  prNumber: number;
}): Promise<void> {
  const writer = createPlatformWriter(options.repositoryUrl, options.owner, options.repo);
  await writer.closeChangeRequest(modelPrBranchName(options.prNumber));
}
