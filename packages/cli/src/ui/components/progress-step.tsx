import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { StepStatus } from '../hooks/use-pipeline.js';

interface Props {
  message: string;
  status: StepStatus;
}

export function ProgressStep({ message, status }: Props): React.ReactElement {
  if (status === 'section') {
    return <Text bold color="cyan">{`\n── ${message} ──`}</Text>;
  }

  if (status === 'running') {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text color="cyan"> {message}</Text>
      </Box>
    );
  }

  const icons: Record<string, string> = {
    success: '✓',
    fail: '✗',
    warn: '⚠',
    info: 'ℹ',
  };
  const colors: Record<string, string> = {
    success: 'green',
    fail: 'red',
    warn: 'yellow',
    info: 'blue',
  };

  return (
    <Text color={colors[status]}>
      {icons[status]} {message}
    </Text>
  );
}
