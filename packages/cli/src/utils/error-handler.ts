import { ErodeError, AdapterError, ErrorCode } from '@erode/core';
import { Logger } from './cli-helpers.js';

interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBackoff: boolean;
  shouldRetry?: (error: unknown) => boolean;
}
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  exponentialBackoff: true,
};

function provideSuggestions(error: ErodeError): void {
  const suggestions: Partial<Record<ErrorCode, string[]>> = {
    [ErrorCode.MISSING_API_KEY]: [
      'Provide an AI provider key: ANTHROPIC_API_KEY or GEMINI_API_KEY',
      'Store the key in a .env file',
      'Obtain an Anthropic key at https://console.anthropic.com/',
      'Obtain a Gemini key at https://aistudio.google.com/apikey',
    ],
    [ErrorCode.SAFETY_FILTERED]: [
      'Content was rejected by the AI provider safety filters',
      'Try simplifying or rewording the input',
      'Check the content for sensitive material',
    ],
    [ErrorCode.PLATFORM_AUTH_ERROR]: [
      'Confirm your GITHUB_TOKEN or GITLAB_TOKEN is still valid',
      'Verify the token has the required repository permissions',
      'Consider generating a new access token',
    ],
    [ErrorCode.FILE_NOT_FOUND]: [
      'Double-check the file path',
      'Confirm file permissions allow reading',
      'Make sure you are in the right directory',
    ],
    [ErrorCode.DIRECTORY_NOT_FOUND]: [
      'Confirm the directory path is valid',
      'Ensure the model workspace is properly configured',
    ],
    [ErrorCode.NETWORK_ERROR]: [
      'Verify your network connection',
      'Review firewall rules',
      'Retry after a short wait',
    ],
    [ErrorCode.RATE_LIMITED]: [
      'Pause for a few minutes, then retry',
      'Upgrading your API tier may help',
    ],
    [ErrorCode.INVALID_URL]: [
      'Verify the URL matches: https://github.com/owner/repo/commit/sha',
      'Confirm the repository and commit are accessible',
    ],
    [ErrorCode.MODEL_NOT_LOADED]: [
      'Call loadFromPath() before querying the model',
      'This is a bug — the adapter was accessed prior to initialization',
    ],
    [ErrorCode.CONTEXT_TOO_LARGE]: [
      'The changeset is too large for analysis',
      'Try with a smaller set of changes',
      'Consider splitting the changes into smaller PRs',
    ],
  };
  let errorSuggestions = suggestions[error.code];
  if (error instanceof AdapterError && error.suggestions && error.suggestions.length > 0) {
    errorSuggestions = error.suggestions;
  }
  if (errorSuggestions && errorSuggestions.length > 0) {
    console.error('\n💡 Hints:');
    errorSuggestions.forEach((suggestion) => {
      Logger.info(`• ${suggestion}`);
    });
  }
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

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

export const ErrorHandler = {
  formatError(error: unknown): void {
    if (error instanceof ErodeError) {
      Logger.fail(error.userMessage);
      if (Object.keys(error.context).length > 0) {
        console.error('   Extra details:');
        for (const [key, value] of Object.entries(error.context)) {
          if (value !== undefined && value !== null) {
            console.error(`   ${key}: ${isSensitiveKey(key) ? '***REDACTED***' : String(value)}`);
          }
        }
      }
      console.error(`   Code: ${error.code}`);
      provideSuggestions(error);
    } else if (error instanceof Error) {
      Logger.fail(error.message);
    } else {
      Logger.fail(`Something went wrong unexpectedly: ${String(error)}`);
    }
  },
  async withRetry<T>(operation: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: unknown;
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (config.shouldRetry && !config.shouldRetry(error)) {
          throw error;
        }
        if (!config.shouldRetry && error instanceof ErodeError && !error.recoverable) {
          throw error;
        }
        if (attempt === config.maxAttempts) {
          break;
        }
        const delay = config.exponentialBackoff
          ? Math.min(config.baseDelay * Math.pow(2, attempt - 1), config.maxDelay)
          : config.baseDelay;
        Logger.warn(`Try ${String(attempt)} failed, retrying in ${String(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  },
  getExitCode(error: unknown): number {
    if (error instanceof ErodeError) {
      switch (error.code) {
        case ErrorCode.CHANGE_SIZE_EXCEEDED:
          return 0;
        case ErrorCode.MISSING_CONFIG:
        case ErrorCode.INVALID_CONFIG:
        case ErrorCode.MISSING_API_KEY:
        case ErrorCode.INVALID_INPUT:
          return 2;
        case ErrorCode.FILE_NOT_FOUND:
        case ErrorCode.DIRECTORY_NOT_FOUND:
        case ErrorCode.PERMISSION_DENIED:
          return 3;
        case ErrorCode.NETWORK_ERROR:
        case ErrorCode.API_ERROR:
        case ErrorCode.TIMEOUT:
        case ErrorCode.RATE_LIMITED:
          return 4;
        case ErrorCode.PLATFORM_AUTH_ERROR:
        case ErrorCode.REPOSITORY_NOT_FOUND:
          return 5;
        default:
          return 1;
      }
    }
    return 1;
  },
  handleCliError(error: unknown): never {
    ErrorHandler.formatError(error);
    const exitCode = ErrorHandler.getExitCode(error);
    process.exit(exitCode);
  },
} as const;
