import React from 'react';
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
  [ErrorCode.MISSING_API_KEY]: [
    'Set at least one AI provider API key: ANTHROPIC_API_KEY or GEMINI_API_KEY',
    'Create a .env file with your API key',
  ],
  [ErrorCode.SAFETY_FILTERED]: [
    "The AI provider's safety filters blocked this content",
    'Try rephrasing or simplifying the input',
  ],
  [ErrorCode.PLATFORM_AUTH_ERROR]: [
    'Check your GITHUB_TOKEN or GITLAB_TOKEN is valid',
    'Ensure the token has appropriate repository permissions',
  ],
  [ErrorCode.FILE_NOT_FOUND]: ['Verify the file path is correct', 'Check file permissions'],
  [ErrorCode.DIRECTORY_NOT_FOUND]: ['Verify the directory path exists'],
  [ErrorCode.NETWORK_ERROR]: ['Check your internet connection', 'Try again in a few moments'],
  [ErrorCode.RATE_LIMITED]: ['Wait a few minutes before trying again'],
  [ErrorCode.CONTEXT_TOO_LARGE]: [
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
        <Text dimColor> Error Code: {error.code}</Text>
        {suggestions && suggestions.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Suggestions:</Text>
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

  return <Text color="red">✗ An unexpected error occurred: {String(error)}</Text>;
}
