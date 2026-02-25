import { ErodeError, AdapterError, ErrorCode } from '../errors.js';
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
      'Set at least one AI provider API key: ANTHROPIC_API_KEY or GEMINI_API_KEY',
      'Create a .env file with your API key',
      'Get an Anthropic key from https://console.anthropic.com/',
      'Get a Gemini key from https://aistudio.google.com/apikey',
    ],
    [ErrorCode.SAFETY_FILTERED]: [
      "The AI provider's safety filters blocked this content",
      'Try rephrasing or simplifying the input',
      'Review the content for potentially sensitive material',
    ],
    [ErrorCode.PLATFORM_AUTH_ERROR]: [
      'Check your GITHUB_TOKEN or GITLAB_TOKEN is valid',
      'Ensure the token has appropriate repository permissions',
      'Try regenerating your access token',
    ],
    [ErrorCode.FILE_NOT_FOUND]: [
      'Verify the file path is correct',
      'Check file permissions',
      "Ensure you're in the correct directory",
    ],
    [ErrorCode.DIRECTORY_NOT_FOUND]: [
      'Verify the directory path exists',
      'Check if the model workspace is correctly set up',
    ],
    [ErrorCode.NETWORK_ERROR]: [
      'Check your internet connection',
      'Verify firewall settings',
      'Try again in a few moments',
    ],
    [ErrorCode.RATE_LIMITED]: [
      'Wait a few minutes before trying again',
      'Consider upgrading your API plan',
    ],
    [ErrorCode.INVALID_URL]: [
      'Check the GitHub URL format: https://github.com/owner/repo/commit/sha',
      'Ensure the repository and commit exist',
    ],
    [ErrorCode.MODEL_NOT_LOADED]: [
      'Ensure loadFromPath() is called before querying the model',
      'This is a programming error — the adapter was used before initialization',
    ],
    [ErrorCode.CONTEXT_TOO_LARGE]: [
      'The commit changes are too large to analyze',
      'Try analyzing smaller commits',
      'Consider breaking down large changes',
    ],
  };
  let errorSuggestions = suggestions[error.code];
  if (error instanceof AdapterError && error.suggestions && error.suggestions.length > 0) {
    errorSuggestions = error.suggestions;
  }
  if (errorSuggestions && errorSuggestions.length > 0) {
    console.error('\n💡 Suggestions:');
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
        console.error('   Additional context:');
        for (const [key, value] of Object.entries(error.context)) {
          if (value !== undefined && value !== null) {
            console.error(`   ${key}: ${isSensitiveKey(key) ? '***REDACTED***' : String(value)}`);
          }
        }
      }
      console.error(`   Error Code: ${error.code}`);
      provideSuggestions(error);
    } else if (error instanceof Error) {
      Logger.fail(error.message);
    } else {
      Logger.fail(`An unexpected error occurred: ${String(error)}`);
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
        Logger.warn(`Attempt ${String(attempt)} failed, retrying in ${String(delay)}ms...`);
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
