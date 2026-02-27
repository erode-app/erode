import { describe, it, expect } from 'vitest';
import {
  ChangeRequestFileSchema,
  ChangeRequestCommitSchema,
  ChangeRequestDataSchema,
} from '../source-platform.schema.js';

function makeValidChangeRequestData(overrides = {}) {
  return {
    number: 42,
    title: 'Test PR',
    body: 'PR description',
    state: 'open',
    author: { login: 'testuser', name: 'Test User' },
    base: { ref: 'main', sha: 'abc123' },
    head: { ref: 'feature/test', sha: 'def456' },
    commits: 3,
    additions: 10,
    deletions: 5,
    changed_files: 2,
    files: [
      {
        filename: 'src/index.ts',
        status: 'modified',
        additions: 5,
        deletions: 3,
        changes: 8,
        patch: '@@ -1,3 +1,5 @@\n-old\n+new',
      },
      {
        filename: 'src/utils.ts',
        status: 'added',
        additions: 5,
        deletions: 2,
        changes: 7,
      },
    ],
    diff: 'diff --git a/src/index.ts b/src/index.ts\n@@ -1,3 +1,5 @@\n-old\n+new',
    stats: { total: 15, additions: 10, deletions: 5 },
    ...overrides,
  };
}

describe('ChangeRequestFileSchema', () => {
  it('should parse a valid file with patch', () => {
    const data = {
      filename: 'src/index.ts',
      status: 'modified',
      additions: 5,
      deletions: 3,
      changes: 8,
      patch: '@@ -1,3 +1,5 @@\n-old\n+new',
    };
    const result = ChangeRequestFileSchema.parse(data);

    expect(result.filename).toBe('src/index.ts');
    expect(result.status).toBe('modified');
    expect(result.additions).toBe(5);
    expect(result.deletions).toBe(3);
    expect(result.changes).toBe(8);
    expect(result.patch).toContain('-old');
  });

  it('should parse a valid file without patch (optional)', () => {
    const data = {
      filename: 'src/index.ts',
      status: 'modified',
      additions: 5,
      deletions: 3,
      changes: 8,
    };
    const result = ChangeRequestFileSchema.parse(data);
    expect(result.patch).toBeUndefined();
  });

  it('should reject missing filename', () => {
    const data = {
      status: 'modified',
      additions: 5,
      deletions: 3,
      changes: 8,
    };
    expect(() => ChangeRequestFileSchema.parse(data)).toThrow();
  });

  it('should reject wrong type for additions', () => {
    const data = {
      filename: 'src/index.ts',
      status: 'modified',
      additions: 'five',
      deletions: 3,
      changes: 8,
    };
    expect(() => ChangeRequestFileSchema.parse(data)).toThrow();
  });

  it('should reject missing changes field', () => {
    const data = {
      filename: 'src/index.ts',
      status: 'modified',
      additions: 5,
      deletions: 3,
    };
    expect(() => ChangeRequestFileSchema.parse(data)).toThrow();
  });
});

describe('ChangeRequestCommitSchema', () => {
  it('should parse a valid commit', () => {
    const data = {
      sha: 'abc123def456',
      message: 'feat: add new feature',
      author: { name: 'Dev', email: 'dev@example.com' },
    };
    const result = ChangeRequestCommitSchema.parse(data);

    expect(result.sha).toBe('abc123def456');
    expect(result.message).toBe('feat: add new feature');
    expect(result.author.name).toBe('Dev');
    expect(result.author.email).toBe('dev@example.com');
  });

  it('should reject missing sha', () => {
    const data = {
      message: 'feat: add new feature',
      author: { name: 'Dev', email: 'dev@example.com' },
    };
    expect(() => ChangeRequestCommitSchema.parse(data)).toThrow();
  });

  it('should reject missing message', () => {
    const data = {
      sha: 'abc123',
      author: { name: 'Dev', email: 'dev@example.com' },
    };
    expect(() => ChangeRequestCommitSchema.parse(data)).toThrow();
  });

  it('should reject missing author object', () => {
    const data = {
      sha: 'abc123',
      message: 'feat: add new feature',
    };
    expect(() => ChangeRequestCommitSchema.parse(data)).toThrow();
  });

  it('should reject author with missing email', () => {
    const data = {
      sha: 'abc123',
      message: 'feat: add new feature',
      author: { name: 'Dev' },
    };
    expect(() => ChangeRequestCommitSchema.parse(data)).toThrow();
  });

  it('should reject author with missing name', () => {
    const data = {
      sha: 'abc123',
      message: 'feat: add new feature',
      author: { email: 'dev@example.com' },
    };
    expect(() => ChangeRequestCommitSchema.parse(data)).toThrow();
  });

  it('should reject wrong types', () => {
    const data = {
      sha: 123,
      message: 'feat: add new feature',
      author: { name: 'Dev', email: 'dev@example.com' },
    };
    expect(() => ChangeRequestCommitSchema.parse(data)).toThrow();
  });
});

describe('ChangeRequestDataSchema', () => {
  it('should parse valid change request data with all fields', () => {
    const data = makeValidChangeRequestData({
      wasTruncated: true,
      truncationReason: 'Too many files',
    });
    const result = ChangeRequestDataSchema.parse(data);

    expect(result.number).toBe(42);
    expect(result.title).toBe('Test PR');
    expect(result.body).toBe('PR description');
    expect(result.state).toBe('open');
    expect(result.author.login).toBe('testuser');
    expect(result.author.name).toBe('Test User');
    expect(result.base.ref).toBe('main');
    expect(result.head.sha).toBe('def456');
    expect(result.commits).toBe(3);
    expect(result.additions).toBe(10);
    expect(result.deletions).toBe(5);
    expect(result.changed_files).toBe(2);
    expect(result.files).toHaveLength(2);
    expect(result.diff).toContain('diff --git');
    expect(result.stats.total).toBe(15);
    expect(result.wasTruncated).toBe(true);
    expect(result.truncationReason).toBe('Too many files');
  });

  it('should parse with minimum valid data (optional fields omitted)', () => {
    const data = makeValidChangeRequestData({
      author: { login: 'testuser' },
    });
    // wasTruncated and truncationReason are not set in defaults
    const result = ChangeRequestDataSchema.parse(data);

    expect(result.wasTruncated).toBeUndefined();
    expect(result.truncationReason).toBeUndefined();
    expect(result.author.name).toBeUndefined();
  });

  it('should handle null body', () => {
    const data = makeValidChangeRequestData({ body: null });
    const result = ChangeRequestDataSchema.parse(data);
    expect(result.body).toBeNull();
  });

  it('should reject missing number', () => {
    const data = makeValidChangeRequestData();
    const { number: _number, ...rest } = data;
    expect(() => ChangeRequestDataSchema.parse(rest)).toThrow();
  });

  it('should reject missing title', () => {
    const data = makeValidChangeRequestData();
    const { title: _title, ...rest } = data;
    expect(() => ChangeRequestDataSchema.parse(rest)).toThrow();
  });

  it('should reject missing diff', () => {
    const data = makeValidChangeRequestData();
    const { diff: _diff, ...rest } = data;
    expect(() => ChangeRequestDataSchema.parse(rest)).toThrow();
  });

  it('should reject missing files array', () => {
    const data = makeValidChangeRequestData();
    const { files: _files, ...rest } = data;
    expect(() => ChangeRequestDataSchema.parse(rest)).toThrow();
  });

  it('should reject missing stats', () => {
    const data = makeValidChangeRequestData();
    const { stats: _stats, ...rest } = data;
    expect(() => ChangeRequestDataSchema.parse(rest)).toThrow();
  });

  it('should reject wrong type for number', () => {
    const data = makeValidChangeRequestData({ number: 'forty-two' });
    expect(() => ChangeRequestDataSchema.parse(data)).toThrow();
  });

  it('should reject wrong type for commits', () => {
    const data = makeValidChangeRequestData({ commits: 'three' });
    expect(() => ChangeRequestDataSchema.parse(data)).toThrow();
  });

  it('should reject invalid file in files array', () => {
    const data = makeValidChangeRequestData({
      files: [{ filename: 'test.ts' }], // missing required fields
    });
    expect(() => ChangeRequestDataSchema.parse(data)).toThrow();
  });

  it('should accept empty files array', () => {
    const data = makeValidChangeRequestData({ files: [] });
    const result = ChangeRequestDataSchema.parse(data);
    expect(result.files).toHaveLength(0);
  });

  it('should accept empty diff string', () => {
    const data = makeValidChangeRequestData({ diff: '' });
    const result = ChangeRequestDataSchema.parse(data);
    expect(result.diff).toBe('');
  });

  it('should reject missing author login', () => {
    const data = makeValidChangeRequestData({ author: { name: 'Test' } });
    expect(() => ChangeRequestDataSchema.parse(data)).toThrow();
  });

  it('should reject missing base ref', () => {
    const data = makeValidChangeRequestData({ base: { sha: 'abc123' } });
    expect(() => ChangeRequestDataSchema.parse(data)).toThrow();
  });

  it('should reject missing head sha', () => {
    const data = makeValidChangeRequestData({ head: { ref: 'feature' } });
    expect(() => ChangeRequestDataSchema.parse(data)).toThrow();
  });
});
