import { z } from 'zod';
import { CONFIG } from '../../utils/config.js';
import { ApiError } from '../../errors.js';
import { sanitizeErrorMessage } from '../platform-utils.js';

interface BitbucketRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: RequestInit['body'];
}

export class BitbucketApiClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(token?: string) {
    this.token = token ?? CONFIG.bitbucket.token;
    this.baseUrl = CONFIG.bitbucket.baseUrl;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      ...(this.token ? { Authorization: this.buildAuthHeader(this.token) } : {}),
      ...extra,
    };
    return headers;
  }

  /** App passwords use Basic auth (username:password), OAuth/PATs use Bearer. */
  private buildAuthHeader(token: string): string {
    if (token.includes(':')) {
      return `Basic ${btoa(token)}`;
    }
    return `Bearer ${token}`;
  }

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: BitbucketRequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: this.buildHeaders(options.headers),
      body: options.body,
    });
    if (!response.ok) {
      const text = await response.text().catch((): string => 'Unknown error');
      throw new ApiError(
        `Bitbucket API error (${String(response.status)}): ${sanitizeErrorMessage(text.slice(0, 200))}`,
        response.status,
        { provider: 'bitbucket' }
      );
    }
    const json = await response.json();
    return schema.parse(json);
  }

  async requestText(path: string, options: BitbucketRequestOptions = {}): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: this.buildHeaders({ Accept: 'text/plain', ...options.headers }),
      body: options.body,
    });
    if (!response.ok) {
      const text = await response.text().catch((): string => 'Unknown error');
      throw new ApiError(
        `Bitbucket API error (${String(response.status)}): ${sanitizeErrorMessage(text.slice(0, 200))}`,
        response.status,
        { provider: 'bitbucket' }
      );
    }
    return response.text();
  }

  async requestVoid(path: string, options: BitbucketRequestOptions = {}): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: this.buildHeaders(options.headers),
      body: options.body,
    });
    if (!response.ok) {
      const text = await response.text().catch((): string => 'Unknown error');
      throw new ApiError(
        `Bitbucket API error (${String(response.status)}): ${sanitizeErrorMessage(text.slice(0, 200))}`,
        response.status,
        { provider: 'bitbucket' }
      );
    }
  }

  /** Fetch all pages of a paginated Bitbucket API response. */
  async paginate<T>(path: string, itemSchema: z.ZodType<T>): Promise<T[]> {
    const pageSchema = z
      .object({
        values: z.array(itemSchema),
        next: z.string().optional(),
      })
      .loose();

    const items: T[] = [];
    let url: string | undefined = `${this.baseUrl}${path}`;

    while (url) {
      const response = await fetch(url, {
        headers: this.buildHeaders(),
      });
      if (!response.ok) {
        const text = await response.text().catch((): string => 'Unknown error');
        throw new ApiError(
          `Bitbucket API error (${String(response.status)}): ${sanitizeErrorMessage(text.slice(0, 200))}`,
          response.status,
          { provider: 'bitbucket' }
        );
      }
      const json = await response.json();
      const page = pageSchema.parse(json);
      items.push(...page.values);
      url = page.next;
    }

    return items;
  }
}
