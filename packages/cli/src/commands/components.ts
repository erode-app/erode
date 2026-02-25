import { Command } from 'commander';
import { runComponents, validate } from '@erode/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { ComponentsOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';

export function createComponentsCommand(): Command {
  return new Command('components')
    .description('List components from architecture model')
    .argument('<model-path>', 'Path to architecture models directory')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .option('--format <format>', 'Output format (table, json, yaml)', 'table')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(ComponentsOptionsSchema, options, 'command options');

      if (validated.format === 'json' || validated.format === 'yaml') {
        try {
          const components = await runComponents({
            modelPath,
            modelFormat: validated.modelFormat,
          });
          console.log(OutputFormatter.format(components, validated.format));
        } catch (error) {
          ErrorHandler.handleCliError(error);
        }
        return;
      }

      try {
        const { runComponentsApp } = await import('./components-app.js');
        await runComponentsApp({ modelPath, modelFormat: validated.modelFormat });
      } catch (error) {
        process.exitCode = ErrorHandler.getExitCode(error);
      }
    });
}
