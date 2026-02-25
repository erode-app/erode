import { ErodeError } from '../errors.js';

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

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
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
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
