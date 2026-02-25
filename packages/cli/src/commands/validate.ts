import { Command } from 'commander';
import { runValidate, validate } from '@erode/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { ValidateOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Check that all components in an architecture model have repository links')
    .argument('<model-path>', 'Path to architecture models directory')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .option('--format <format>', 'Output format (table, json)', 'table')
    .action(async (modelPath: string, options: unknown) => {
      const validated = validate(ValidateOptionsSchema, options, 'command options');

      if (validated.format === 'json') {
        try {
          const result = await runValidate({
            modelPath,
            modelFormat: validated.modelFormat,
          });
          console.log(
            OutputFormatter.format(
              {
                modelVersion: result.versionCheck,
                total: result.total,
                linked: result.linked,
                unlinked: result.unlinked,
                components: result.components,
              },
              'json'
            )
          );
          if (result.hasIssues) {
            process.exitCode = 1;
          }
        } catch (error) {
          ErrorHandler.handleCliError(error);
        }
        return;
      }

      try {
        const { runValidateApp } = await import('./validate-app.js');
        const result = await runValidateApp({
          modelPath,
          modelFormat: validated.modelFormat,
        });
        if (result?.hasIssues) {
          process.exitCode = 1;
        }
      } catch (error) {
        process.exitCode = ErrorHandler.getExitCode(error);
      }
    });
}
