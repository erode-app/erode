import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  GitLabMrResponseSchema,
  GitLabDiffEntrySchema,
  GitLabCommitEntrySchema,
} from '../gitlab-api.schema.js';

function makeValidMrResponse(overrides = {}) {
  return {
    iid: 42,
    title: 'Test MR',
    description: 'MR description',
    state: 'opened',
    author: { username: 'testuser', name: 'Test User' },
    target_branch: 'main',
    source_branch: 'feature/test',
    diff_refs: { base_sha: 'abc123', head_sha: 'def456' },
    commits_count: 3,
    ...overrides,
  };
}

function makeValidDiffEntry(overrides = {}) {
  return {
    old_path: 'src/old.ts',
    new_path: 'src/new.ts',
    diff: '@@ -1,3 +1,3 @@\n-old\n+new',
    new_file: false,
    deleted_file: false,
    renamed_file: true,
    ...overrides,
  };
}

function makeValidCommitEntry(overrides = {}) {
  return {
    id: 'abc123def456',
    message: 'feat: add new feature',
    author_name: 'Dev',
    author_email: 'dev@example.com',
    ...overrides,
  };
}

describe('GitLabMrResponseSchema', () => {
  it('should parse a valid MR response', () => {
    const data = makeValidMrResponse();
    const result = GitLabMrResponseSchema.parse(data);

    expect(result.iid).toBe(42);
    expect(result.title).toBe('Test MR');
    expect(result.description).toBe('MR description');
    expect(result.state).toBe('opened');
    expect(result.author).toEqual({ username: 'testuser', name: 'Test User' });
    expect(result.target_branch).toBe('main');
    expect(result.source_branch).toBe('feature/test');
    expect(result.diff_refs).toEqual({ base_sha: 'abc123', head_sha: 'def456' });
    expect(result.commits_count).toBe(3);
  });

  it('should reject missing iid', () => {
    const data = makeValidMrResponse();
    const { iid: _iid, ...rest } = data;
    expect(() => GitLabMrResponseSchema.parse(rest)).toThrow();
  });

  it('should reject missing title', () => {
    const data = makeValidMrResponse();
    const { title: _title, ...rest } = data;
    expect(() => GitLabMrResponseSchema.parse(rest)).toThrow();
  });

  it('should reject missing state', () => {
    const data = makeValidMrResponse();
    const { state: _state, ...rest } = data;
    expect(() => GitLabMrResponseSchema.parse(rest)).toThrow();
  });

  it('should handle null author', () => {
    const data = makeValidMrResponse({ author: null });
    const result = GitLabMrResponseSchema.parse(data);
    expect(result.author).toBeNull();
  });

  it('should handle null diff_refs', () => {
    const data = makeValidMrResponse({ diff_refs: null });
    const result = GitLabMrResponseSchema.parse(data);
    expect(result.diff_refs).toBeNull();
  });

  it('should handle null description', () => {
    const data = makeValidMrResponse({ description: null });
    const result = GitLabMrResponseSchema.parse(data);
    expect(result.description).toBeNull();
  });

  it('should pass through extra fields', () => {
    const data = makeValidMrResponse({ web_url: 'https://gitlab.com/mr/42', labels: ['bug'] });
    const result = GitLabMrResponseSchema.parse(data);
    expect(result).toHaveProperty('web_url', 'https://gitlab.com/mr/42');
    expect(result).toHaveProperty('labels', ['bug']);
  });

  it('should reject iid of wrong type', () => {
    const data = makeValidMrResponse({ iid: 'not-a-number' });
    expect(() => GitLabMrResponseSchema.parse(data)).toThrow();
  });

  it('should reject commits_count of wrong type', () => {
    const data = makeValidMrResponse({ commits_count: 'three' });
    expect(() => GitLabMrResponseSchema.parse(data)).toThrow();
  });
});

describe('GitLabDiffEntrySchema', () => {
  it('should parse a valid diff entry', () => {
    const data = makeValidDiffEntry();
    const result = GitLabDiffEntrySchema.parse(data);

    expect(result.old_path).toBe('src/old.ts');
    expect(result.new_path).toBe('src/new.ts');
    expect(result.diff).toContain('-old');
    expect(result.new_file).toBe(false);
    expect(result.deleted_file).toBe(false);
    expect(result.renamed_file).toBe(true);
  });

  it('should handle null diff', () => {
    const data = makeValidDiffEntry({ diff: null });
    const result = GitLabDiffEntrySchema.parse(data);
    expect(result.diff).toBeNull();
  });

  it('should reject missing old_path', () => {
    const data = makeValidDiffEntry();
    const { old_path: _old_path, ...rest } = data;
    expect(() => GitLabDiffEntrySchema.parse(rest)).toThrow();
  });

  it('should reject missing new_file boolean', () => {
    const data = makeValidDiffEntry();
    const { new_file: _new_file, ...rest } = data;
    expect(() => GitLabDiffEntrySchema.parse(rest)).toThrow();
  });

  it('should pass through extra fields', () => {
    const data = makeValidDiffEntry({ a_mode: '100644', b_mode: '100644' });
    const result = GitLabDiffEntrySchema.parse(data);
    expect(result).toHaveProperty('a_mode', '100644');
  });

  it('should parse an array of diff entries', () => {
    const data = [makeValidDiffEntry(), makeValidDiffEntry({ new_path: 'src/other.ts' })];
    const result = z.array(GitLabDiffEntrySchema).parse(data);
    expect(result).toHaveLength(2);
    expect(result[1]?.new_path).toBe('src/other.ts');
  });

  it('should reject invalid diff entry in array', () => {
    const data = [makeValidDiffEntry(), { old_path: 'only-this' }];
    expect(() => z.array(GitLabDiffEntrySchema).parse(data)).toThrow();
  });
});

describe('GitLabCommitEntrySchema', () => {
  it('should parse a valid commit entry', () => {
    const data = makeValidCommitEntry();
    const result = GitLabCommitEntrySchema.parse(data);

    expect(result.id).toBe('abc123def456');
    expect(result.message).toBe('feat: add new feature');
    expect(result.author_name).toBe('Dev');
    expect(result.author_email).toBe('dev@example.com');
  });

  it('should handle null author_name', () => {
    const data = makeValidCommitEntry({ author_name: null });
    const result = GitLabCommitEntrySchema.parse(data);
    expect(result.author_name).toBeNull();
  });

  it('should handle null author_email', () => {
    const data = makeValidCommitEntry({ author_email: null });
    const result = GitLabCommitEntrySchema.parse(data);
    expect(result.author_email).toBeNull();
  });

  it('should reject missing id', () => {
    const data = makeValidCommitEntry();
    const { id: _id, ...rest } = data;
    expect(() => GitLabCommitEntrySchema.parse(rest)).toThrow();
  });

  it('should reject missing message', () => {
    const data = makeValidCommitEntry();
    const { message: _message, ...rest } = data;
    expect(() => GitLabCommitEntrySchema.parse(rest)).toThrow();
  });

  it('should pass through extra fields', () => {
    const data = makeValidCommitEntry({ created_at: '2024-01-01T00:00:00Z' });
    const result = GitLabCommitEntrySchema.parse(data);
    expect(result).toHaveProperty('created_at', '2024-01-01T00:00:00Z');
  });

  it('should reject id of wrong type', () => {
    const data = makeValidCommitEntry({ id: 12345 });
    expect(() => GitLabCommitEntrySchema.parse(data)).toThrow();
  });

  it('should parse an array of commit entries', () => {
    const data = [
      makeValidCommitEntry(),
      makeValidCommitEntry({ id: 'xyz789', message: 'fix: bug' }),
    ];
    const result = z.array(GitLabCommitEntrySchema).parse(data);
    expect(result).toHaveLength(2);
    expect(result[1]?.id).toBe('xyz789');
  });
});
