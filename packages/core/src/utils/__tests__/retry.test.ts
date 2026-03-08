import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  debug: { verbose: false },
}));

vi.mock('../config.js', () => ({
  CONFIG: mockConfig,
}));

import { withRetry } from '../retry.js';
import { ErodeError, ErrorCode } from '../../errors.js';

const FAST_POLICY = {
  retries: 2,
  initialDelay: 1,
  delayCap: 10,
  useExponentialBackoff: false,
};

describe('withRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfig.debug.verbose = false;
  });

  afterEach(() => {
    mockConfig.debug.verbose = false;
  });

  it('returns result on first success without retrying', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(operation, FAST_POLICY);

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on recoverable error, then succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValue('recovered');

    const result = await withRetry(operation, FAST_POLICY);

    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws immediately when shouldRetry returns false', async () => {
    const error = new Error('not retryable');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(operation, {
        ...FAST_POLICY,
        shouldRetry: () => false,
      })
    ).rejects.toThrow('not retryable');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('throws immediately for non-recoverable ErodeError without custom shouldRetry', async () => {
    const error = new ErodeError(
      'fail',
      ErrorCode.CONFIG_INVALID,
      undefined,
      {},
      false
    );
    const operation = vi.fn().mockRejectedValue(error);

    await expect(withRetry(operation, FAST_POLICY)).rejects.toThrow(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('throws last error after exhausting all retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(operation, { ...FAST_POLICY, retries: 1 })
    ).rejects.toThrow('always fails');

    // 1 initial attempt + 1 retry = 2 calls
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('logs retry message when CONFIG.debug.verbose is true', async () => {
    mockConfig.debug.verbose = true;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');

    await withRetry(operation, FAST_POLICY);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Retry]')
    );
  });

  it('does not log when verbose is false', async () => {
    mockConfig.debug.verbose = false;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');

    await withRetry(operation, FAST_POLICY);

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
