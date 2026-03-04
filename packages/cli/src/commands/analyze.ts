import { Command } from 'commander';
import { runAnalyze, validate } from '@erode/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { AnalyzeOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';
import { ConsoleProgress } from '../console-progress.js';

export function createAnalyzeCommand(): Command {
  return new Command('analyze')
    .description('Inspect a pull request for architectural deviations')
    .argument('<model-path>', 'Local directory or path within --model-repo containing model files')
    .requiredOption('--url <url>', 'Pull request or merge request URL to inspect')
    .option('--model-format <format>', 'Format of the architecture model', 'likec4')
    .option('--output-file <path>', 'Save structured JSON results to a file')
    .option('--format <format>', 'Result format (console, json)', 'console')
    .option('--open-pr', 'Open a pull request with model changes')
    .option('--model-repo <repo>', 'Repository URL or owner/repo containing the architecture model')
    .option('--model-ref <ref>', 'Branch or tag to clone from --model-repo', 'main')
    .option('--patch-local', 'Patch the architecture model in-place')
    .option('--dry-run', 'Preview results without creating a PR')
    .option('--draft', 'Mark the generated pull request as draft', true)
    .option('--skip-file-filtering', 'Bypass file filters and inspect every changed file')
    .option('--comment', 'Publish findings as a comment on the PR')
    .option('--github-actions', 'Emit GitHub Actions outputs and step summary')
    .option('--fail-on-violations', 'Return a non-zero exit code if violations exist')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(AnalyzeOptionsSchema, options, 'command options');
      const progress = new ConsoleProgress();

      try {
        const result = await runAnalyze({ modelPath, ...validated }, progress);
        if (validated.format === 'json') {
          if (result.structured) {
            console.log(OutputFormatter.format(result.structured, 'json'));
          }
        } else {
          if (result.structured) {
            console.log(OutputFormatter.formatConsole(result.structured));
          }
        }
        if (validated.failOnViolations && result.hasViolations) {
          process.exitCode = 1;
        }
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
