import { describe, it, expect } from 'vitest';
import { LikeC4ElementSchema, LikeC4RelationshipSchema } from '../likec4.schema.js';

describe('LikeC4ElementSchema', () => {
  it('should parse element with all fields', () => {
    const element = {
      id: 'frontend',
      title: 'Web Frontend',
      description: 'The main web app',
      kind: 'webApp',
      tags: ['ui', 'public'],
      links: [
        'https://github.com/example/frontend',
        { url: 'https://docs.example.com', title: 'Docs' },
      ],
      technology: 'React',
    };

    const result = LikeC4ElementSchema.parse(element);
    expect(result.id).toBe('frontend');
    expect(result.title).toBe('Web Frontend');
    expect(result.description).toBe('The main web app');
    expect(result.kind).toBe('webApp');
    expect(result.tags).toEqual(['ui', 'public']);
    expect(result.links).toHaveLength(2);
    expect(result.technology).toBe('React');
  });

  it('should parse element with minimal fields (id, kind)', () => {
    const element = { id: 'database', kind: 'storage' };

    const result = LikeC4ElementSchema.parse(element);
    expect(result.id).toBe('database');
    expect(result.kind).toBe('storage');
    expect(result.title).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.tags).toBeUndefined();
    expect(result.links).toBeUndefined();
    expect(result.technology).toBeUndefined();
  });

  it('should parse element with mixed link types', () => {
    const element = {
      id: 'api',
      kind: 'service',
      links: [
        'https://github.com/example/api',
        { url: 'https://swagger.example.com' },
        { url: 'https://docs.example.com', title: 'API Docs' },
      ],
    };

    const result = LikeC4ElementSchema.parse(element);
    expect(result.links).toHaveLength(3);
    expect(result.links?.[0]).toBe('https://github.com/example/api');
    expect(result.links?.[1]).toEqual({ url: 'https://swagger.example.com' });
    expect(result.links?.[2]).toEqual({ url: 'https://docs.example.com', title: 'API Docs' });
  });

  it('should reject element missing id', () => {
    const element = { kind: 'service' };
    expect(() => LikeC4ElementSchema.parse(element)).toThrow();
  });

  it('should reject element missing kind', () => {
    const element = { id: 'api' };
    expect(() => LikeC4ElementSchema.parse(element)).toThrow();
  });

  it('should pass through extra fields', () => {
    const element = {
      id: 'api',
      kind: 'service',
      customField: 'custom-value',
      metadata: { version: 2 },
    };

    const result = LikeC4ElementSchema.parse(element);
    expect(result.id).toBe('api');
    expect((result as Record<string, unknown>)['customField']).toBe('custom-value');
    expect((result as Record<string, unknown>)['metadata']).toEqual({ version: 2 });
  });
});

describe('LikeC4RelationshipSchema', () => {
  it('should parse relationship with string source/target', () => {
    const relationship = {
      source: 'frontend',
      target: 'api_gateway',
      title: 'makes requests',
      kind: 'https',
    };

    const result = LikeC4RelationshipSchema.parse(relationship);
    expect(result.source).toBe('frontend');
    expect(result.target).toBe('api_gateway');
    expect(result.title).toBe('makes requests');
    expect(result.kind).toBe('https');
  });

  it('should parse relationship with object source/target', () => {
    const relationship = {
      source: { id: 'frontend' },
      target: { id: 'api_gateway' },
      title: 'makes requests',
    };

    const result = LikeC4RelationshipSchema.parse(relationship);
    expect(result.source).toEqual({ id: 'frontend' });
    expect(result.target).toEqual({ id: 'api_gateway' });
    expect(result.title).toBe('makes requests');
  });

  it('should parse relationship without optional fields', () => {
    const relationship = {
      source: 'a',
      target: 'b',
    };

    const result = LikeC4RelationshipSchema.parse(relationship);
    expect(result.source).toBe('a');
    expect(result.target).toBe('b');
    expect(result.title).toBeUndefined();
    expect(result.kind).toBeUndefined();
  });

  it('should reject relationship missing source', () => {
    const relationship = { target: 'b' };
    expect(() => LikeC4RelationshipSchema.parse(relationship)).toThrow();
  });

  it('should reject relationship missing target', () => {
    const relationship = { source: 'a' };
    expect(() => LikeC4RelationshipSchema.parse(relationship)).toThrow();
  });

  it('should pass through extra fields', () => {
    const relationship = {
      source: 'a',
      target: 'b',
      customField: 'extra',
    };

    const result = LikeC4RelationshipSchema.parse(relationship);
    expect((result as Record<string, unknown>)['customField']).toBe('extra');
  });
});
