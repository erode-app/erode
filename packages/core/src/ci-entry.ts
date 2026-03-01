#!/usr/bin/env node
import { runAnalyze } from './pipelines/analyze.js';
import type { AnalyzeOptions } from './pipelines/analyze.js';
import { createPlatformReader, createPlatformWriter } from './platforms/platform-factory.js';
import { formatErrorAsComment, COMMENT_MARKER } from './output.js';

function parseArgs(argv: string[]): AnalyzeOptions {
  const args = argv.slice(2);
  // args[0] = 'analyze', args[1] = modelPath
  const modelPath = args[1];
  if (!modelPath) {
    console.error('Usage: erode-ci analyze <model-path> --url <url> [flags]');
    process.exit(2);
  }

  const getFlag = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(name);

  const url = getFlag('--url');
  if (!url) {
    console.error('--url must be provided');
    process.exit(2);
  }

  return {
    modelPath,
    url,
    modelFormat: getFlag('--model-format') ?? 'likec4',
    format: (getFlag('--format') as 'console' | 'json' | undefined) ?? 'json',
    comment: hasFlag('--comment'),
    githubActions: hasFlag('--github-actions'),
    openPr: hasFlag('--open-pr'),
    patch: hasFlag('--patch'),
    failOnViolations: hasFlag('--fail-on-violations'),
    skipFileFiltering: hasFlag('--skip-file-filtering'),
    draft: !hasFlag('--no-draft'),
    modelRepo: getFlag('--model-repo'),
  };
}

const options = parseArgs(process.argv);

try {
  const result = await runAnalyze(options);

  if (result.structured) {
    console.log(JSON.stringify(result.structured, null, 2));
  }

  if (options.failOnViolations && result.hasViolations) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`erode: fatal: ${error instanceof Error ? error.message : String(error)}`);

  if (options.comment) {
    try {
      const reader = createPlatformReader(options.url);
      const ref = reader.parseChangeRequestUrl(options.url);
      const writer = createPlatformWriter(
        ref.repositoryUrl,
        ref.platformId.owner,
        ref.platformId.repo
      );
      await writer.commentOnChangeRequest(ref, formatErrorAsComment(error), {
        upsertMarker: COMMENT_MARKER,
      });
    } catch (commentError) {
      console.error(
        `erode: could not post error comment: ${commentError instanceof Error ? commentError.message : String(commentError)}`
      );
    }
  }

  process.exitCode = 1;
}
