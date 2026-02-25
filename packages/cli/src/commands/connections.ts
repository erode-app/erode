import { Command } from 'commander';
import { runConnections, validate } from '@erode/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { ConnectionsOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';

export function createConnectionsCommand(): Command {
  return new Command('connections')
    .description('Show component connections from architecture model')
    .argument('<model-path>', 'Path to architecture models directory')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .requiredOption('--repo <url>', 'Repository URL (GitHub or GitLab)')
    .option('--output <format>', 'Output format (console, json)', 'console')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(ConnectionsOptionsSchema, options, 'command options');

      if (validated.output === 'json') {
        try {
          const connections = await runConnections({
            modelPath,
            modelFormat: validated.modelFormat,
            repo: validated.repo,
          });
          console.log(OutputFormatter.format(connections, 'json'));
        } catch (error) {
          ErrorHandler.handleCliError(error);
        }
        return;
      }

      try {
        const { runConnectionsApp } = await import('./connections-app.js');
        await runConnectionsApp({
          modelPath,
          modelFormat: validated.modelFormat,
          repo: validated.repo,
        });
      } catch (error) {
        process.exitCode = ErrorHandler.getExitCode(error);
      }
    });
}
