import type React from 'react';
import { Box, Text } from 'ink';

interface Column {
  key: string;
  header: string;
}

interface Props {
  data: Record<string, unknown>[];
  columns?: Column[];
}

const MAX_WIDTH = 50;

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length === 0 ? '' : value.join(', ');
  return JSON.stringify(value);
}

function pad(str: string, width: number): string {
  if (str.length > width) return str.substring(0, width - 3) + '...';
  return str.padEnd(width);
}

export function DataTable({ data, columns: customColumns }: Props): React.ReactElement {
  if (data.length === 0) {
    return <Text dimColor>Nothing to show</Text>;
  }

  const firstRow = data[0];
  if (!firstRow) {
    return <Text dimColor>Nothing to show</Text>;
  }

  const columns =
    customColumns ??
    Object.keys(firstRow).map((key) => ({
      key,
      header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
    }));

  const widths = columns.map((col) => {
    const headerW = col.header.length;
    const dataW = Math.max(...data.map((row) => cellToString(row[col.key]).length));
    return Math.min(Math.max(headerW, dataW), MAX_WIDTH);
  });

  return (
    <Box flexDirection="column">
      <Text bold>{columns.map((col, i) => pad(col.header, widths[i] ?? 0)).join(' │ ')}</Text>
      <Text dimColor>{widths.map((w) => '─'.repeat(w)).join('─┼─')}</Text>
      {data.map((row, ri) => (
        <Text key={ri}>
          {columns.map((col, i) => pad(cellToString(row[col.key]), widths[i] ?? 0)).join(' │ ')}
        </Text>
      ))}
    </Box>
  );
}
