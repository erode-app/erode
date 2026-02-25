import chalk from 'chalk';
import { OutputFormat } from './validation.js';
interface ProgressIndicator {
  start(message: string): void;
  update(message: string): void;
  succeed(message: string): void;
  fail(message: string): void;
  warn(message: string): void;
  info(message: string): void;
}
class ConsoleProgress implements ProgressIndicator {
  start(message: string): void {
    console.log(chalk.cyan(`🔄 ${message}...`));
  }
  update(message: string): void {
    console.log(chalk.blue(`   ${message}...`));
  }
  succeed(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }
  fail(message: string): void {
    console.error(chalk.red(`❌ ${message}`));
  }
  warn(message: string): void {
    console.warn(chalk.yellow(`⚠️  ${message}`));
  }
  info(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
  }
}
class SilentProgress implements ProgressIndicator {
  start(_message: string): void {
    /* noop */
  }
  update(_message: string): void {
    /* noop */
  }
  succeed(_message: string): void {
    /* noop */
  }
  fail(_message: string): void {
    /* noop */
  }
  warn(_message: string): void {
    /* noop */
  }
  info(_message: string): void {
    /* noop */
  }
}
export const Logger = {
  fail(message: string): void {
    console.error(chalk.red(`❌ ${message}`));
  },
  warn(message: string): void {
    console.warn(chalk.yellow(`⚠️  ${message}`));
  },
  info(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
  },
  success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  },
} as const;
interface TableColumn {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

function isPlainObject(value: unknown): value is object {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isNonArrayObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown, indent = 0): string {
  if (value === null) return chalk.gray('null');
  if (value === undefined) return chalk.gray('undefined');
  if (typeof value === 'boolean') return chalk.blue(String(value));
  if (typeof value === 'number') return chalk.magenta(String(value));
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const spaces = '  '.repeat(indent + 1);
    const items = value
      .map((item) => {
        if (isNonArrayObject(item)) {
          const formatted = OutputFormatter.formatObject(item, indent + 1);
          return `${spaces}- ${formatted.replace(/^\s+/, '')}`;
        }
        return `${spaces}- ${formatValue(item, indent + 1)}`;
      })
      .join('\n');
    return `\n${items}`;
  }
  if (isNonArrayObject(value)) {
    return `\n${OutputFormatter.formatObject(value, indent + 1)}`;
  }
  return '[unknown value]';
}

function toYaml(data: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    return data.map((item) => `${spaces}- ${toYaml(item, indent + 1).trim()}`).join('\n');
  }
  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        const yamlValue = toYaml(value, indent + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:\n${yamlValue}`;
        }
        return `${spaces}${key}: ${yamlValue.trim()}`;
      })
      .join('\n');
  }
  if (typeof data === 'string') {
    if (data.includes('\n') || data.includes(':') || data.includes('-')) {
      return JSON.stringify(data);
    }
    return data;
  }
  return String(data);
}

export const OutputFormatter = {
  format(data: unknown, format: OutputFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'yaml':
        return toYaml(data);
      case 'table':
        if (Array.isArray(data)) {
          return OutputFormatter.formatTable(
            data.filter((item): item is object => typeof item === 'object' && item !== null)
          );
        }
        if (typeof data === 'object' && data !== null) {
          return OutputFormatter.formatObject(data);
        }
        return String(data);
      case 'console':
      default:
        return OutputFormatter.formatConsole(data);
    }
  },
  formatTable(data: object[], columns?: TableColumn[]): string {
    const firstRow = data[0];
    if (!firstRow) {
      return chalk.gray('No data to display');
    }
    const MAX_COLUMN_WIDTH = 50;
    const autoColumns: TableColumn[] =
      columns ??
      Object.keys(firstRow).map((key) => ({
        key,
        header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      }));
    const widths = autoColumns.map((col) => {
      const headerWidth = col.header.length;
      const dataWidth = Math.max(
        ...data.map((row) => {
          if (!Object.prototype.hasOwnProperty.call(row, col.key)) {
            return 0;
          }
          const value: unknown = Reflect.get(row, col.key);
          if (value == null) return 0;
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            return String(value).length;
          }
          if (Array.isArray(value)) {
            return value.length === 0 ? 0 : value.join(', ').length;
          }
          return '[object]'.length;
        })
      );
      return Math.min(Math.max(headerWidth, dataWidth, col.width ?? 0), MAX_COLUMN_WIDTH);
    });
    const header = autoColumns.map((col, i) => col.header.padEnd(widths[i] ?? 0)).join(' | ');
    const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
    const rows = data.map((row) =>
      autoColumns
        .map((col, i) => {
          if (!Object.prototype.hasOwnProperty.call(row, col.key)) {
            return ''.padEnd(widths[i] ?? 0);
          }
          const cellValue: unknown = Reflect.get(row, col.key);
          let value: string;
          if (cellValue == null) {
            value = '';
          } else if (
            typeof cellValue === 'string' ||
            typeof cellValue === 'number' ||
            typeof cellValue === 'boolean'
          ) {
            value = String(cellValue);
          } else if (Array.isArray(cellValue)) {
            value = cellValue.length === 0 ? '' : cellValue.join(', ');
          } else {
            value = '[object]';
          }
          if (value.length > MAX_COLUMN_WIDTH) {
            value = value.substring(0, MAX_COLUMN_WIDTH - 3) + '...';
          }
          return value.padEnd(widths[i] ?? 0);
        })
        .join(' | ')
    );
    return [chalk.bold(header), chalk.gray(separator), ...rows].join('\n');
  },
  formatObject(data: object, indent = 0): string {
    const entries = Object.entries(data);
    const maxKeyLength = Math.max(...entries.map(([key]) => key.length));
    const spaces = '  '.repeat(indent);
    return entries
      .map(([key, value]) => {
        const formattedKey = chalk.bold(key.padEnd(maxKeyLength));
        const formattedValue = formatValue(value, indent);
        return `${spaces}${formattedKey}: ${formattedValue}`;
      })
      .join('\n');
  },
  formatConsole(data: unknown): string {
    if (Array.isArray(data)) {
      return data
        .map((item, index) => {
          let formatted: string;
          if (isPlainObject(item)) {
            formatted = OutputFormatter.formatObject(item);
          } else if (
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean'
          ) {
            formatted = String(item);
          } else {
            formatted = '[unknown value]';
          }
          return `${chalk.cyan(`[${String(index + 1)}]`)} ${formatted}`;
        })
        .join('\n\n');
    }
    if (typeof data === 'object' && data !== null) {
      return OutputFormatter.formatObject(data);
    }
    return String(data);
  },
} as const;
export function createProgress(silent = false): ProgressIndicator {
  return silent ? new SilentProgress() : new ConsoleProgress();
}
export function displaySection(title: string): void {
  console.log('\n' + chalk.bold.cyan(`── ${title} ──`));
}
