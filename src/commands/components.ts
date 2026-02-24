import { Command } from 'commander';
import { createAdapter } from '../adapters/adapter-factory.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { validatePath, validate, ComponentsOptionsSchema } from '../utils/validation.js';
import { createProgress, displaySection, OutputFormatter } from '../utils/cli-helpers.js';

export function createComponentsCommand(): Command {
  return new Command('components')
    .description('List components from architecture model')
    .argument('<model-path>', 'Path to architecture models directory')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .option('--format <format>', 'Output format (table, json, yaml)', 'table')
    .action(async (modelPath: string, options: unknown) => {
      const progress = createProgress();
      try {
        const validatedOptions = validate(ComponentsOptionsSchema, options, 'command options');
        const adapter = createAdapter(validatedOptions.modelFormat);
        displaySection(`Loading ${adapter.metadata.displayName} Architecture Model`);
        validatePath(modelPath, 'directory');
        progress.start('Loading architecture model');
        const components = await adapter.loadAndListComponents(modelPath);
        progress.succeed(`Loaded ${String(components.length)} components`);

        const displayData =
          validatedOptions.format === 'table'
            ? components.map((c) => ({
                id: c.id,
                title: c.title,
                kind: c.kind,
                links: c.links,
              }))
            : components;

        const output = OutputFormatter.format(displayData, validatedOptions.format);
        progress.info(output);
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
