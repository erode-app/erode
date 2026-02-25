#!/usr/bin/env node
import { runAnalyze } from './pipelines/analyze.js';
import type { AnalyzeOptions } from './pipelines/analyze.js';

function parseArgs(argv: string[]): AnalyzeOptions {
  const args = argv.slice(2);
  // args[0] = 'analyze', args[1] = modelPath
  const modelPath = args[1];
  if (!modelPath) {
    console.error('Usage: erode-ci analyze <model-path> --url <url> [options]');
    process.exit(2);
  }

  const getFlag = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(name);

  const url = getFlag('--url');
  if (!url) {
    console.error('--url is required');
    process.exit(2);
  }

  return {
    modelPath,
    url,
    modelFormat: getFlag('--model-format') ?? 'likec4',
    format: (getFlag('--format') as 'console' | 'json' | undefined) ?? 'json',
    comment: hasFlag('--comment'),
    githubActions: hasFlag('--github-actions'),
    generateModel: hasFlag('--generate-model'),
    openPr: hasFlag('--open-pr'),
    failOnViolations: hasFlag('--fail-on-violations'),
    skipFileFiltering: hasFlag('--skip-file-filtering'),
    draft: !hasFlag('--no-draft'),
  };
}

const options = parseArgs(process.argv);
const result = await runAnalyze(options);

if (result.structured) {
  console.log(JSON.stringify(result.structured, null, 2));
}

if (options.failOnViolations && result.hasViolations) {
  process.exitCode = 1;
}
