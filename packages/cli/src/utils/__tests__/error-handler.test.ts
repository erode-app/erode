import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { ErodeError, ErrorCode } from '@erode/core';

vi.mock('../cli-helpers.js', () => ({
  Logger: {
    fail: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { ErrorHandler } from '../error-handler.js';

function getErrorLines(spy: MockInstance): string[] {
  return spy.mock.calls
    .map((c: unknown[]) => c[0])
    .filter((v): v is string => typeof v === 'string');
}

describe('ErrorHandler.formatError - sensitive key redaction', () => {
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockReturnValue(undefined);
    vi.spyOn(console, 'log').mockReturnValue(undefined);
    vi.spyOn(console, 'warn').mockReturnValue(undefined);
  });

  it('should redact keys containing "token"', () => {
    const error = new ErodeError('Test error', ErrorCode.AUTH_KEY_MISSING, 'Test user message', {
      githubToken: 'test_value_redacted',
    });

    ErrorHandler.formatError(error);

    const detailLine = getErrorLines(consoleErrorSpy).find((c) => c.includes('githubToken'));
    expect(detailLine).toContain('***REDACTED***');
    expect(detailLine).not.toContain('test_value_redacted');
  });

  it('should redact keys containing "secret"', () => {
    const error = new ErodeError('Test error', ErrorCode.AUTH_KEY_MISSING, 'Test user message', {
      apiSecret: 'test_value_redacted',
    });

    ErrorHandler.formatError(error);

    const detailLine = getErrorLines(consoleErrorSpy).find((c) => c.includes('apiSecret'));
    expect(detailLine).toContain('***REDACTED***');
    expect(detailLine).not.toContain('test_value_redacted');
  });

  it('should redact keys containing "auth"', () => {
    const error = new ErodeError('Test error', ErrorCode.NET_ERROR, 'Test user message', {
      myAuthHeader: 'test_value_redacted',
    });

    ErrorHandler.formatError(error);

    const detailLine = getErrorLines(consoleErrorSpy).find((c) => c.includes('myAuthHeader'));
    expect(detailLine).toContain('***REDACTED***');
    expect(detailLine).not.toContain('test_value_redacted');
  });

  it('should redact keys containing "key"', () => {
    const error = new ErodeError('Test error', ErrorCode.AUTH_KEY_MISSING, 'Test user message', {
      accessKey: 'test_value_redacted',
    });

    ErrorHandler.formatError(error);

    const detailLine = getErrorLines(consoleErrorSpy).find((c) => c.includes('accessKey'));
    expect(detailLine).toContain('***REDACTED***');
    expect(detailLine).not.toContain('test_value_redacted');
  });

  it('should not redact non-sensitive keys', () => {
    const error = new ErodeError('Test error', ErrorCode.NET_ERROR, 'Test user message', {
      cloneUrl: 'https://github.com/owner/repo.git',
    });

    ErrorHandler.formatError(error);

    const detailLine = getErrorLines(consoleErrorSpy).find((c) => c.includes('cloneUrl'));
    expect(detailLine).toContain('https://github.com/owner/repo.git');
    expect(detailLine).not.toContain('***REDACTED***');
  });

  it('should redact URL credentials in non-sensitive values', () => {
    const error = new ErodeError('Test error', ErrorCode.IO_CLONE_FAILED, 'Test user message', {
      cloneUrl: 'https://x-access-token@github.com/owner/repo.git',
    });

    ErrorHandler.formatError(error);

    const detailLine = getErrorLines(consoleErrorSpy).find((c) => c.includes('cloneUrl'));
    expect(detailLine).toContain('https://***@');
    expect(detailLine).not.toContain('x-access-token@');
  });
});

describe('ErrorHandler.getExitCode', () => {
  it('returns 2 for config/auth errors', () => {
    const error = new ErodeError('test', ErrorCode.AUTH_KEY_MISSING, 'msg');
    expect(ErrorHandler.getExitCode(error)).toBe(2);
  });

  it('returns 1 for generic errors', () => {
    expect(ErrorHandler.getExitCode(new Error('test'))).toBe(1);
  });
});
