import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../../../errors.js';

// Mock config
vi.mock('../../../utils/config.js', () => ({
  CONFIG: {
    bitbucket: { token: 'test-token', baseUrl: 'https://api.bitbucket.org/2.0' },
  },
}));

// Mock platform-utils (sanitizeErrorMessage)
vi.mock('../../platform-utils.js', async (importOriginal) => {
  return importOriginal();
});

import { BitbucketApiClient } from '../api-client.js';

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

describe('BitbucketApiClient', () => {
  let client: BitbucketApiClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new BitbucketApiClient('test-token');
  });

  describe('auth header', () => {
    it('should use Bearer auth for plain tokens', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ value: 1 }));

      await client.request('/test', z.object({ value: z.number() }));

      const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    it('should use Basic auth for username:password tokens', async () => {
      const appPasswordClient = new BitbucketApiClient('myuser:app-password-123');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ value: 1 }));

      await appPasswordClient.request('/test', z.object({ value: z.number() }));

      const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Basic ${btoa('myuser:app-password-123')}`);
    });
  });

  describe('paginate', () => {
    it('should collect items from multiple pages', async () => {
      const itemSchema = z.object({ id: z.number() });
      const fetchSpy = vi.spyOn(globalThis, 'fetch') as Mock;

      fetchSpy
        .mockResolvedValueOnce(
          mockFetchResponse({
            values: [{ id: 1 }, { id: 2 }],
            next: 'https://api.bitbucket.org/2.0/test?page=2',
          })
        )
        .mockResolvedValueOnce(
          mockFetchResponse({
            values: [{ id: 3 }],
            next: 'https://api.bitbucket.org/2.0/test?page=3',
          })
        )
        .mockResolvedValueOnce(
          mockFetchResponse({
            values: [{ id: 4 }],
          })
        );

      const items = await client.paginate('/test', itemSchema);

      expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should return items from a single page when there is no next link', async () => {
      const itemSchema = z.object({ name: z.string() });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({ values: [{ name: 'only-page' }] })
      );

      const items = await client.paginate('/single', itemSchema);

      expect(items).toEqual([{ name: 'only-page' }]);
    });

    it('should throw ApiError on non-ok response during pagination', async () => {
      const itemSchema = z.object({ id: z.number() });
      const fetchSpy = vi.spyOn(globalThis, 'fetch') as Mock;

      fetchSpy
        .mockResolvedValueOnce(
          mockFetchResponse({
            values: [{ id: 1 }],
            next: 'https://api.bitbucket.org/2.0/test?page=2',
          })
        )
        .mockResolvedValueOnce(mockFetchResponse('Rate limited', false, 429));

      await expect(client.paginate('/test', itemSchema)).rejects.toThrow(ApiError);
    });

    it('should reject pagination with cross-origin next URL', async () => {
      const itemSchema = z.object({ id: z.number() });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse({
          values: [{ id: 1 }],
          next: 'https://evil.example.com/steal-token?page=2',
        })
      );

      await expect(client.paginate('/test', itemSchema)).rejects.toThrow(/origin mismatch/);
    });

    it('should accept pagination with same-origin next URL', async () => {
      const itemSchema = z.object({ id: z.number() });
      const fetchSpy = vi.spyOn(globalThis, 'fetch') as Mock;

      fetchSpy
        .mockResolvedValueOnce(
          mockFetchResponse({
            values: [{ id: 1 }],
            next: 'https://api.bitbucket.org/2.0/other-path?page=2',
          })
        )
        .mockResolvedValueOnce(
          mockFetchResponse({
            values: [{ id: 2 }],
          })
        );

      const items = await client.paginate('/test', itemSchema);
      expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('error sanitization', () => {
    it('should sanitize HTML error responses', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockFetchResponse(
          '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>',
          false,
          502
        )
      );

      try {
        await client.request('/test', z.object({}));
        expect.fail('Expected ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).not.toContain('<html');
        expect((error as ApiError).message).not.toContain('<!DOCTYPE');
        expect((error as ApiError).message).toContain('502 Bad Gateway');
      }
    });
  });
});
