import { Command } from 'commander';
import { runComponents, validate } from '@erode-app/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { ComponentsOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';
import { ConsoleProgress } from '../console-progress.js';

export function createComponentsCommand(): Command {
  return new Command('components')
    .description('Display all components in the architecture model')
    .argument('<model-path>', 'Directory containing architecture model files')
    .option('--model-format <format>', 'Format of the architecture model', 'likec4')
    .option('--format <format>', 'Result format (table, json, yaml)', 'table')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(ComponentsOptionsSchema, options, 'command options');
      const progress = validated.format === 'json' ? undefined : new ConsoleProgress();

      try {
        const components = await runComponents(
          { modelPath, modelFormat: validated.modelFormat },
          progress
        );
        console.log(OutputFormatter.format(components, validated.format));
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
