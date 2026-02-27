import { ErodeError } from '../errors.js';

export interface RetryPolicy {
  retries: number;
  initialDelay: number;
  delayCap: number;
  useExponentialBackoff: boolean;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  retries: 2,
  initialDelay: 500,
  delayCap: 15000,
  useExponentialBackoff: true,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryPolicy> = {}
): Promise<T> {
  const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...options };
  let remaining = policy.retries;
  let attempt = 0;
  let lastError: unknown;

  for (;;) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (policy.shouldRetry && !policy.shouldRetry(error)) {
        throw error;
      }
      if (!policy.shouldRetry && error instanceof ErodeError && !error.recoverable) {
        throw error;
      }

      if (remaining <= 0) break;
      remaining--;

      const rawDelay = policy.useExponentialBackoff
        ? Math.min(policy.initialDelay * Math.pow(2, attempt), policy.delayCap)
        : policy.initialDelay;
      const delay = rawDelay * (0.5 + Math.random() * 0.5);
      attempt++;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
