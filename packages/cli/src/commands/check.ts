import { Command } from 'commander';
import {
  runCheck,
  generateGitDiff,
  parseRepoFromRemote,
  normalizeToHttps,
  getRemoteUrl,
  validate,
  ErodeError,
  ErrorCode,
} from '@erode-app/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { resolveModelPath } from '../utils/resolve-model-path.js';
import { CheckOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';
import { ConsoleProgress } from '../console-progress.js';

export function createCheckCommand(): Command {
  return new Command('check')
    .description('Check local changes for architectural drift before pushing')
    .argument('[model-path]', 'Directory containing the architecture model files')
    .option('--repo <url>', 'Repository URL (auto-detected from git remote if omitted)')
    .option('--model-format <format>', 'Format of the architecture model', 'likec4')
    .option('--staged', 'Only check staged changes')
    .option('--branch <branch>', 'Compare against a branch (e.g. main)')
    .option('--component <id>', 'Component ID to analyse (skips auto-selection)')
    .option('--format <format>', 'Output format (console, json)', 'console')
    .option('--fail-on-violations', 'Exit with code 1 when violations are found')
    .option('--skip-file-filtering', 'Bypass .erodeignore file patterns')
    .action(async (modelPath: string | undefined, options: unknown) => {
      try {
        const resolvedModelPath = resolveModelPath(modelPath);
        const validated = validate(CheckOptionsSchema, options, 'command options');
        const progress = validated.format === 'json' ? undefined : new ConsoleProgress();
        // ── Resolve repository URL ───────────────────────────────────────
        let repoUrl = validated.repo;
        if (!repoUrl) {
          let remote: string;
          try {
            remote = getRemoteUrl();
          } catch {
            throw new ErodeError(
              'Could not detect repository URL from git remote',
              ErrorCode.INPUT_INVALID,
              'Could not detect the repository URL. Make sure you are inside a git repository with an "origin" remote, or use --repo to specify the URL explicitly.'
            );
          }
          repoUrl = normalizeToHttps(remote);
          progress?.info(`Detected repository: ${repoUrl}`);
        }

        const { owner, repo } = parseRepoFromRemote(repoUrl);

        // ── Generate diff ────────────────────────────────────────────────
        const diffResult = generateGitDiff({
          staged: validated.staged,
          branch: validated.branch,
        });

        if (!diffResult.diff) {
          progress?.succeed('No changes to check');
          return;
        }

        progress?.info(
          `Checking ${String(diffResult.stats.filesChanged)} file(s), ` +
            `+${String(diffResult.stats.additions)} -${String(diffResult.stats.deletions)}`
        );

        // ── Run check pipeline ───────────────────────────────────────────
        const result = await runCheck(
          {
            modelPath: resolvedModelPath,
            diff: diffResult.diff,
            repo: repoUrl,
            repoOwner: owner,
            repoName: repo,
            modelFormat: validated.modelFormat,
            componentId: validated.component,
            format: validated.format,
            files: diffResult.files,
            stats: diffResult.stats,
            skipFileFiltering: validated.skipFileFiltering,
          },
          progress
        );

        // ── Output ───────────────────────────────────────────────────────
        if (validated.format === 'json') {
          if (result.structured) {
            console.log(OutputFormatter.format(result.structured, 'json'));
          }
        } else if (result.structured) {
          console.log(OutputFormatter.formatConsole(result.structured));
        }

        if (validated.failOnViolations && result.hasViolations) {
          process.exitCode = 1;
        }
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
