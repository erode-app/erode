import { Command } from 'commander';
import { runValidate, validate, ErodeError, ErrorCode, CONFIG } from '@erode-app/core';
import { ErrorHandler } from '../utils/error-handler.js';
import { ValidateOptionsSchema } from '../utils/command-schemas.js';
import { OutputFormatter } from '../utils/cli-helpers.js';
import { ConsoleProgress } from '../console-progress.js';

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Verify every component in the model is linked to a repository')
    .argument('[model-path]', 'Directory containing architecture model files')
    .option('--model-format <format>', 'Format of the architecture model', 'likec4')
    .option('--format <format>', 'Result format (table, json)', 'table')
    .action(async (modelPath: string | undefined, options: unknown) => {
      const resolvedModelPath = modelPath ?? CONFIG.adapter.modelPath;
      if (!resolvedModelPath) {
        throw new ErodeError(
          'Provide <model-path> or set adapter.modelPath in .eroderc.json',
          ErrorCode.INPUT_INVALID
        );
      }
      const validated = validate(ValidateOptionsSchema, options, 'command options');
      const progress = validated.format === 'json' ? undefined : new ConsoleProgress();

      try {
        const result = await runValidate(
          { modelPath: resolvedModelPath, modelFormat: validated.modelFormat },
          progress
        );
        const data = {
          modelVersion: result.versionCheck,
          total: result.total,
          linked: result.linked,
          unlinked: result.unlinked,
          components: result.components,
        };
        console.log(OutputFormatter.format(data, validated.format));
        if (result.hasIssues) {
          process.exitCode = 1;
        }
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
