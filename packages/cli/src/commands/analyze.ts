import { Command } from 'commander';
import { runAnalyze, validate } from '@erode/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { AnalyzeOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';

export function createAnalyzeCommand(): Command {
  return new Command('analyze')
    .description('Analyze a change request for architecture drift')
    .argument('<model-path>', 'Path to architecture models directory')
    .requiredOption('--url <url>', 'Change request URL (GitHub PR or GitLab MR)')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .option('--generate-model', 'Generate architecture model code from analysis')
    .option('--output-file <path>', 'Write structured JSON output to file')
    .option('--format <format>', 'Output format (console, json)', 'console')
    .option('--open-pr', 'Create PR with model updates')
    .option('--dry-run', 'Skip PR creation (preview only)')
    .option('--draft', 'Create change request as draft', true)
    .option('--skip-file-filtering', 'Skip file filtering and analyze all changed files')
    .option('--comment', 'Post analysis results as a PR comment')
    .option('--github-actions', 'Write GitHub Actions outputs and step summary')
    .option('--fail-on-violations', 'Exit with code 1 when violations are found')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(AnalyzeOptionsSchema, options, 'command options');

      if (validated.format === 'json') {
        try {
          const result = await runAnalyze({ modelPath, ...validated });
          if (result.structured) {
            console.log(OutputFormatter.format(result.structured, 'json'));
          }
          if (validated.failOnViolations && result.hasViolations) {
            process.exitCode = 1;
          }
        } catch (error) {
          ErrorHandler.handleCliError(error);
        }
        return;
      }

      try {
        const { runAnalyzeApp } = await import('./analyze-app.js');
        const result = await runAnalyzeApp({ modelPath, ...validated });
        if (validated.failOnViolations && result?.hasViolations) {
          process.exitCode = 1;
        }
      } catch (error) {
        process.exitCode = ErrorHandler.getExitCode(error);
      }
    });
}
