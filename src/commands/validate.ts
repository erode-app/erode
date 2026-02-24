import { Command } from 'commander';
import { createAdapter } from '../adapters/adapter-factory.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { validatePath, validate, ValidateOptionsSchema } from '../utils/validation.js';
import { createProgress, OutputFormatter } from '../utils/cli-helpers.js';

function findRepositoryLink(links: string[]): string | undefined {
  return links.find((link) => link.includes('github.com') || link.includes('gitlab.com'));
}

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Check that all components in an architecture model have repository links')
    .argument('<model-path>', 'Path to architecture models directory')
    .option('--model-format <format>', 'Architecture model format', 'likec4')
    .option('--format <format>', 'Output format (table, json)', 'table')
    .action(async (modelPath: string, options: unknown) => {
      const progress = createProgress();
      try {
        const validatedOptions = validate(ValidateOptionsSchema, options, 'command options');
        const adapter = createAdapter(validatedOptions.modelFormat);

        let versionResult: { found: boolean; version?: string; compatible?: boolean; minimum: string } | null = null;
        if (adapter.checkVersion) {
          progress.start(`Checking ${adapter.metadata.displayName} version compatibility`);
          versionResult = adapter.checkVersion(modelPath);
          if (versionResult.found && versionResult.compatible) {
            progress.succeed(
              `${adapter.metadata.displayName} version ${versionResult.version} is compatible (minimum: ${versionResult.minimum})`
            );
          } else if (versionResult.found && !versionResult.compatible) {
            progress.warn(
              `${adapter.metadata.displayName} version ${versionResult.version} is below minimum ${versionResult.minimum}. Update the ${adapter.metadata.id} dependency in the source repo.`
            );
            process.exitCode = 1;
          } else {
            progress.warn(`Could not detect ${adapter.metadata.displayName} version — skipping compatibility check`);
          }
        }

        validatePath(modelPath, 'directory');

        progress.start('Loading architecture model');
        const components = await adapter.loadAndListComponents(modelPath);
        progress.succeed(`Loaded ${components.length} components`);

        const mapped = components.map((c) => ({
          id: c.id,
          title: c.title ?? c.id,
          kind: c.kind,
          repository: findRepositoryLink(c.links) ?? 'MISSING',
        }));

        const linked = mapped.filter((c) => c.repository !== 'MISSING');
        const unlinked = mapped.filter((c) => c.repository === 'MISSING');

        if (validatedOptions.format === 'json') {
          const output = OutputFormatter.format(
            {
              modelVersion: versionResult
                ? {
                    detected: versionResult.version ?? null,
                    minimum: versionResult.minimum,
                    compatible: versionResult.compatible ?? null,
                  }
                : null,
              total: mapped.length,
              linked: linked.length,
              unlinked: unlinked.length,
              components: mapped,
            },
            'json'
          );
          console.log(output);
        } else {
          const output = OutputFormatter.format(mapped, 'table');
          progress.info(output);
        }

        if (unlinked.length > 0) {
          progress.warn(
            `${unlinked.length} of ${mapped.length} component(s) are missing repository links`
          );
          for (const line of adapter.metadata.missingLinksHelpLines) {
            progress.info(line);
          }
          process.exitCode = 1;
        } else if (mapped.length > 0) {
          progress.succeed('All components have repository links');
        }
      } catch (error) {
        ErrorHandler.handleCliError(error);
      }
    });
}
