import { Command } from 'commander';
import { execSync } from 'child_process';
import { runCheck, generateGitDiff, parseRepoFromRemote, validate } from '@erode-app/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { CheckOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';
import { ConsoleProgress } from '../console-progress.js';

export function createCheckCommand(): Command {
  return new Command('check')
    .description('Check local changes for architectural drift before pushing')
    .argument('<model-path>', 'Directory containing the architecture model files')
    .option('--repo <url>', 'Repository URL (auto-detected from git remote if omitted)')
    .option('--model-format <format>', 'Format of the architecture model', 'likec4')
    .option('--staged', 'Only check staged changes')
    .option('--branch <branch>', 'Compare against a branch (e.g. main)')
    .option('--component <id>', 'Component ID to analyse (skips auto-selection)')
    .option('--format <format>', 'Output format (console, json)', 'console')
    .option('--fail-on-violations', 'Exit with code 1 when violations are found')
    .option('--skip-file-filtering', 'Bypass .erodeignore file patterns')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(CheckOptionsSchema, options, 'command options');
      const progress = validated.format === 'json' ? undefined : new ConsoleProgress();

      try {
        // ── Resolve repository URL ───────────────────────────────────────
        let repoUrl = validated.repo;
        if (!repoUrl) {
          const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
          // Normalise SSH URLs to HTTPS for adapter matching
          repoUrl = normaliseToHttps(remote);
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
            modelPath,
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

/** Convert SSH-style git remote URLs to HTTPS. */
function normaliseToHttps(remote: string): string {
  // git@github.com:owner/repo.git → https://github.com/owner/repo
  const sshMatch = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remote);
  if (sshMatch?.[1] && sshMatch[2]) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  // Already HTTPS — strip trailing .git
  return remote.replace(/\.git$/, '');
}
