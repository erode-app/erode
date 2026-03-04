import { Command } from 'commander';
import { runConnections, validate } from '@erode/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { ConnectionsOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';
import { ConsoleProgress } from '../console-progress.js';

export function createConnectionsCommand(): Command {
  return new Command('connections')
    .description('Display component relationships from the architecture model')
    .argument('<model-path>', 'Directory containing architecture model files')
    .option('--model-format <format>', 'Format of the architecture model', 'likec4')
    .requiredOption('--repo <url>', 'GitHub or GitLab repository URL')
    .option('--output <format>', 'Result format (console, json)', 'console')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(ConnectionsOptionsSchema, options, 'command options');
      const progress = validated.output === 'json' ? undefined : new ConsoleProgress();

      try {
        const connections = await runConnections(
          { modelPath, modelFormat: validated.modelFormat, repo: validated.repo },
          progress
        );
        console.log(OutputFormatter.format(connections, validated.output));
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
