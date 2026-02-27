import type React from 'react';
import { Box, Text } from 'ink';
import { ErodeError, AdapterError, ErrorCode } from '@erode/core';

interface Props {
  error: unknown;
}

const SENSITIVE_KEYS = new Set([
  'token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'authorization',
  'credential',
]);

const SUGGESTIONS: Partial<Record<ErrorCode, string[]>> = {
  [ErrorCode.AUTH_KEY_MISSING]: [
    'Provide an AI provider key: ANTHROPIC_API_KEY or GEMINI_API_KEY',
    'Store the key in a .env file',
  ],
  [ErrorCode.PROVIDER_SAFETY_BLOCK]: [
    "The AI provider's safety filters blocked this content",
    'Try rephrasing or simplifying the input',
  ],
  [ErrorCode.AUTH_PLATFORM_FAILURE]: [
    'Confirm your GITHUB_TOKEN or GITLAB_TOKEN is still valid',
    'Verify the token has the required repository permissions',
  ],
  [ErrorCode.IO_FILE_NOT_FOUND]: [
    'Double-check the file path',
    'Confirm file permissions allow reading',
  ],
  [ErrorCode.IO_DIR_NOT_FOUND]: ['Confirm the directory path is valid'],
  [ErrorCode.NET_ERROR]: ['Verify your network connection', 'Retry after a short wait'],
  [ErrorCode.PROVIDER_RATE_LIMITED]: ['Pause for a few minutes, then retry'],
  [ErrorCode.PROVIDER_CONTEXT_OVERFLOW]: [
    'Try analyzing smaller commits',
    'Consider breaking down large changes',
  ],
};

export function ErrorDisplay({ error }: Props): React.ReactElement {
  if (error instanceof ErodeError) {
    const contextEntries = Object.entries(error.context).filter(([, v]) => v != null);
    let suggestions = SUGGESTIONS[error.code];
    if (error instanceof AdapterError && error.suggestions && error.suggestions.length > 0) {
      suggestions = error.suggestions;
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="red">✗ {error.userMessage}</Text>
        {contextEntries.length > 0 && (
          <Box flexDirection="column" marginLeft={2}>
            {contextEntries.map(([key, value]) => (
              <Text key={key} dimColor>
                {key}: {SENSITIVE_KEYS.has(key.toLowerCase()) ? '***REDACTED***' : String(value)}
              </Text>
            ))}
          </Box>
        )}
        <Text dimColor> Code: {error.code}</Text>
        {suggestions && suggestions.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Hints:</Text>
            {suggestions.map((s, i) => (
              <Text key={i} color="blue">
                {'  • '}
                {s}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (error instanceof Error) {
    return <Text color="red">✗ {error.message}</Text>;
  }

  return <Text color="red">✗ Something went wrong unexpectedly: {String(error)}</Text>;
}
