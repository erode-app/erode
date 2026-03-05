import chalk from 'chalk';
import type { ProgressReporter } from '@erode-app/core';

/** Console-based progress reporter that writes to stderr. */
export class ConsoleProgress implements ProgressReporter {
  section(title: string): void {
    process.stderr.write(`\n${chalk.bold(title)}\n`);
  }

  start(message: string): void {
    process.stderr.write(`${chalk.dim('...')} ${message}\n`);
  }

  succeed(message: string): void {
    process.stderr.write(`${chalk.green('✓')} ${message}\n`);
  }

  fail(message: string): void {
    process.stderr.write(`${chalk.red('✗')} ${message}\n`);
  }

  warn(message: string): void {
    process.stderr.write(`${chalk.yellow('⚠')} ${message}\n`);
  }

  info(message: string): void {
    process.stderr.write(`${chalk.blue('ℹ')} ${message}\n`);
  }
}
