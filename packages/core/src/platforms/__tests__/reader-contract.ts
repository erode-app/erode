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
      it('should return a ChangeRequestRef with required fields for a valid URL', () => {
        const reader = getReader();
        const ref = reader.parseChangeRequestUrl(fixtures.validUrl);

        expect(ref).toBeDefined();
        expect(typeof ref.number).toBe('number');
        expect(ref.number).toBeGreaterThan(0);
        expect(typeof ref.url).toBe('string');
        expect(ref.url.length).toBeGreaterThan(0);
        expect(typeof ref.repositoryUrl).toBe('string');
        expect(ref.repositoryUrl.length).toBeGreaterThan(0);
        expect(ref.platformId).toBeDefined();
        expect(typeof ref.platformId).toBe('object');
      });

      it('should throw for an invalid URL', () => {
        const reader = getReader();
        expect(() => reader.parseChangeRequestUrl(fixtures.invalidUrl)).toThrow();
      });

      it('should return consistent results for the same URL', () => {
        const reader = getReader();
        const ref1 = reader.parseChangeRequestUrl(fixtures.validUrl);
        const ref2 = reader.parseChangeRequestUrl(fixtures.validUrl);

        expect(ref1.number).toBe(ref2.number);
        expect(ref1.repositoryUrl).toBe(ref2.repositoryUrl);
        expect(ref1.url).toBe(ref2.url);
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

    describe('interface shape', () => {
      it('should implement fetchChangeRequest as a function', () => {
        const reader = getReader();
        expect(typeof reader.fetchChangeRequest).toBe('function');
      });

      it('should implement fetchChangeRequestCommits as a function', () => {
        const reader = getReader();
        expect(typeof reader.fetchChangeRequestCommits).toBe('function');
      });

      it('should implement parseChangeRequestUrl as a function', () => {
        const reader = getReader();
        expect(typeof reader.parseChangeRequestUrl).toBe('function');
      });
    });
  });
}
