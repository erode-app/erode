import { Command } from 'commander';
import chalk from 'chalk';
import { createAdapter } from '../adapters/adapter-factory.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { validatePath, validate, ConnectionsOptionsSchema } from '../utils/validation.js';
import { createProgress, displaySection, OutputFormatter } from '../utils/cli-helpers.js';

export function createConnectionsCommand(): Command {
  return new Command('connections')
    .description('Show component connections from architecture model')
    .argument('<model-path>', 'Path to architecture models directory')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .requiredOption('--repo <url>', 'Repository URL (GitHub or GitLab)')
    .option('--output <format>', 'Output format (console, json)', 'console')
    .action(async (modelPath: string, options: unknown) => {
      const progress = createProgress();
      try {
        const validatedOptions = validate(ConnectionsOptionsSchema, options, 'command options');
        const adapter = createAdapter(validatedOptions.modelFormat);

        displaySection(`Loading ${adapter.metadata.displayName} Architecture Model`);
        validatePath(modelPath, 'directory');
        progress.start('Loading architecture model');
        await adapter.loadFromPath(modelPath);
        progress.succeed('Architecture model loaded');

        progress.start(`Finding components for ${validatedOptions.repo}`);
        const components = adapter.findAllComponentsByRepository(validatedOptions.repo);

        if (components.length === 0) {
          progress.warn(`No components found for repository: ${validatedOptions.repo}`);
          progress.info('Run "erode validate <model-path>" to check which components have repository links.');
          return;
        }
        progress.succeed(`Found ${components.length} component(s)`);

        if (validatedOptions.output === 'json') {
          const jsonData = components.map((component) => {
            const dependencies = adapter.getComponentDependencies(component.id);
            const dependents = adapter.getComponentDependents(component.id);
            const relationships = adapter.getComponentRelationships(component.id);
            return {
              component: {
                id: component.id,
                name: component.name,
                type: component.type,
                repository: component.repository,
              },
              dependencies: dependencies.map((d) => ({
                id: d.id,
                name: d.name,
                type: d.type,
                repository: d.repository,
              })),
              dependents: dependents.map((d) => ({
                id: d.id,
                name: d.name,
                type: d.type,
                repository: d.repository,
              })),
              relationships: relationships.map((r) => ({
                targetId: r.target.id,
                targetName: r.target.name,
                kind: r.kind,
                title: r.title,
              })),
            };
          });
          const output = OutputFormatter.format(jsonData, 'json');
          console.log(output);
          return;
        }

        for (const component of components) {
          displaySection(`${component.name} (${component.id})`);
          console.log(chalk.gray(`  Type: ${component.type}`));
          if (component.repository) {
            console.log(chalk.gray(`  Repository: ${component.repository}`));
          }

          const dependencies = adapter.getComponentDependencies(component.id);
          const dependents = adapter.getComponentDependents(component.id);
          const relationships = adapter.getComponentRelationships(component.id);

          if (dependencies.length > 0) {
            console.log(chalk.bold('\n  Dependencies:'));
            for (const dep of dependencies) {
              console.log(chalk.blue(`    -> ${dep.name} (${dep.type})`));
            }
          } else {
            console.log(chalk.gray('\n  Dependencies: none'));
          }

          if (dependents.length > 0) {
            console.log(chalk.bold('\n  Dependents:'));
            for (const dep of dependents) {
              console.log(chalk.magenta(`    <- ${dep.name} (${dep.type})`));
            }
          } else {
            console.log(chalk.gray('\n  Dependents: none'));
          }

          if (relationships.length > 0) {
            console.log(chalk.bold('\n  Relationships:'));
            for (const rel of relationships) {
              const kind = rel.kind ? chalk.gray(` [${rel.kind}]`) : '';
              const title = rel.title ? chalk.gray(` "${rel.title}"`) : '';
              console.log(`    -> ${rel.target.name}${kind}${title}`);
            }
          }
        }
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
