#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Logger } from './utils/cli-helpers.js';
import { createComponentsCommand } from './commands/components.js';
import { createConnectionsCommand } from './commands/connections.js';
import { createAnalyzeCommand } from './commands/analyze.js';
import { createValidateCommand } from './commands/validate.js';
import { PackageJsonSchema } from './schemas/package.schema.js';
import { validate } from './utils/validation.js';

function setupSignalHandlers(): void {
  const handleShutdown = (signal: string) => {
    Logger.warn(`Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  };
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    Logger.fail('Uncaught Exception:');
    console.error(error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    Logger.fail('Unhandled Promise Rejection:');
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    process.exit(1);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = validate(
  PackageJsonSchema,
  JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8')),
  'PackageJson'
);
const version = packageJson.version;

setupSignalHandlers();

const program = new Command();
program
  .name('Erode')
  .description('Architecture drift detection tool for software systems')
  .version(version);

program.addCommand(createComponentsCommand());
program.addCommand(createConnectionsCommand());
program.addCommand(createAnalyzeCommand());
program.addCommand(createValidateCommand());

program.configureHelp({
  subcommandTerm: (cmd) => cmd.name() + (cmd.alias() ? `|${cmd.alias()}` : ''),
});

program.action(() => {
  program.help();
});

program.parse();
