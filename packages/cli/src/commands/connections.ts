import { Command } from 'commander';
import { runConnections, validate } from '@erode-app/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { resolveModelPath } from '../utils/resolve-model-path.js';
import { ConnectionsOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';
import { ConsoleProgress } from '../console-progress.js';

export function createConnectionsCommand(): Command {
  return new Command('connections')
    .description('Display component relationships from the architecture model')
    .argument('[model-path]', 'Directory containing architecture model files')
    .option('--model-format <format>', 'Format of the architecture model', 'likec4')
    .requiredOption('--repo <url>', 'GitHub or GitLab repository URL')
    .option('--output <format>', 'Result format (console, json)', 'console')
    .action(async (modelPath: string | undefined, options: unknown) => {
      try {
        const resolvedModelPath = resolveModelPath(modelPath);
        const validated = validate(ConnectionsOptionsSchema, options, 'command options');
        const progress = validated.output === 'json' ? undefined : new ConsoleProgress();
        const connections = await runConnections(
          {
            modelPath: resolvedModelPath,
            modelFormat: validated.modelFormat,
            repo: validated.repo,
          },
          progress
        );
        console.log(OutputFormatter.format(connections, validated.output));
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
