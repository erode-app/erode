import { describe, it, expect } from 'vitest';
import type { SourcePlatformReader } from '../source-platform.js';

/**
 * Contract tests for any SourcePlatformReader implementation.
 *
 * Usage:
 *   runReaderContractTests(() => new MyReader(), {
 *     validUrl: 'https://platform.com/org/repo/pull/42',
 *     invalidUrl: 'https://example.com/not-a-pr',
 *   });
 */
export function runReaderContractTests(
  getReader: () => SourcePlatformReader,
  fixtures: { validUrl: string; invalidUrl: string }
): void {
  describe('SourcePlatformReader contract', () => {
    describe('parseChangeRequestUrl', () => {
      it('should throw for an invalid URL', () => {
        const reader = getReader();
        expect(() => reader.parseChangeRequestUrl(fixtures.invalidUrl)).toThrow();
      });

      it('should preserve the original URL in the ref', () => {
        const reader = getReader();
        const ref = reader.parseChangeRequestUrl(fixtures.validUrl);
        expect(ref.url).toBe(fixtures.validUrl);
      });

      it('should derive repositoryUrl from the change request URL', () => {
        const reader = getReader();
        const ref = reader.parseChangeRequestUrl(fixtures.validUrl);
        // The repository URL should be a prefix of the change request URL
        expect(fixtures.validUrl.startsWith(ref.repositoryUrl)).toBe(true);
      });
    });
  });
}
