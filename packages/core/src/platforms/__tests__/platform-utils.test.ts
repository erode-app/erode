import { describe, it, expect, vi } from 'vitest';
import { ErodeError, ApiError, ErrorCode } from '../../errors.js';

vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    constraints: { maxFilesPerDiff: 50, maxLinesPerDiff: 5000 },
  },
}));

import {
  applyDiffTruncation,
  wrapPlatformError,
  sanitizeErrorMessage,
  isTransientError,
} from '../platform-utils.js';
import { extractStatusCode } from '../../utils/error-utils.js';

function makeFile(filename: string, changes = 1) {
  return { filename, status: 'modified', additions: changes, deletions: 0, changes };
}

describe('applyDiffTruncation', () => {
  it('returns all files with wasTruncated false when within limits', () => {
    const files = [makeFile('a.ts', 10), makeFile('b.ts', 20)];
    const result = applyDiffTruncation(files, 30);
    expect(result.wasTruncated).toBe(false);
    expect(result.files).toHaveLength(2);
    expect(result.truncationReason).toBeUndefined();
  });

  it('truncates to maxFilesPerDiff when file count exceeds limit', () => {
    const files = Array.from({ length: 60 }, (_, i) => makeFile(`file${String(i)}.ts`));
    const result = applyDiffTruncation(files, 60);
    expect(result.wasTruncated).toBe(true);
    expect(result.files).toHaveLength(50);
    expect(result.truncationReason).toContain('50-file limit');
    expect(result.truncationReason).toContain('60 files found');
  });

  it('keeps all files but marks truncated when line count exceeds limit', () => {
    const files = [makeFile('big.ts', 6000)];
    const result = applyDiffTruncation(files, 6000);
    expect(result.wasTruncated).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.truncationReason).toContain('5000-line limit');
    expect(result.truncationReason).toContain('6000 lines found');
  });
});

describe('wrapPlatformError', () => {
  it('rethrows ErodeError unchanged', () => {
    const erodeError = new ErodeError('original', ErrorCode.PLATFORM_INVALID_URL, 'user msg');
    expect(() => wrapPlatformError(erodeError, 'github', 'op')).toThrow(erodeError);
  });

  it('wraps Error as ApiError with provider context', () => {
    const error = new Error('something went wrong');
    try {
      wrapPlatformError(error, 'github', 'Could not retrieve pull request');
      expect.fail('Expected error to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain('Could not retrieve pull request');
      expect((err as ApiError).message).toContain('something went wrong');
      expect((err as ApiError).context).toHaveProperty('provider', 'github');
    }
  });

  it('rethrows non-Error values unchanged', () => {
    const rawValue = { custom: true };
    expect(() => wrapPlatformError(rawValue, 'github', 'op')).toThrow();
    try {
      wrapPlatformError(rawValue, 'github', 'op');
    } catch (err) {
      expect(err).toBe(rawValue);
    }
  });
});

describe('sanitizeErrorMessage', () => {
  it('returns plain message unchanged', () => {
    expect(sanitizeErrorMessage('Not Found')).toBe('Not Found');
  });

  it('strips HTML tags from error message', () => {
    const html = '<!DOCTYPE html><html><body>Bad Gateway</body></html>';
    const result = sanitizeErrorMessage(html);
    expect(result).not.toMatch(/<[^>]*>/);
    expect(result).toContain('Bad Gateway');
  });
});

describe('extractStatusCode', () => {
  it('extracts numeric status from an error with status property', () => {
    const error = Object.assign(new Error('Bad Gateway'), { status: 502 });
    expect(extractStatusCode(error)).toBe(502);
  });

  it('returns undefined when error has no status property', () => {
    expect(extractStatusCode(new Error('plain error'))).toBeUndefined();
  });
});

describe('isTransientError', () => {
  it('returns true for 500-level status codes', () => {
    const error500 = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const error502 = Object.assign(new Error('Bad Gateway'), { status: 502 });
    expect(isTransientError(error500)).toBe(true);
    expect(isTransientError(error502)).toBe(true);
  });

  it('returns false for 400-level status codes', () => {
    const error403 = Object.assign(new Error('Forbidden'), { status: 403 });
    const error404 = Object.assign(new Error('Not Found'), { status: 404 });
    expect(isTransientError(error403)).toBe(false);
    expect(isTransientError(error404)).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientError('string error')).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});
