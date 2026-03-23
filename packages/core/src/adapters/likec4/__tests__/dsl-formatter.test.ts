import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('likec4', () => ({
  LikeC4: {
    fromWorkspace: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/erode-likec4-fmt-abc'),
  cp: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { LikeC4 } from 'likec4';
import { formatLikeC4Dsl } from '../dsl-formatter.js';

const mockFromWorkspace = vi.mocked(LikeC4.fromWorkspace);

describe('formatLikeC4Dsl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return formatted content on success', async () => {
    const formattedContent = 'model {\n  a = service\n}\n';
    const formatMap = new Map([['file:///tmp/erode-likec4-fmt-abc/model.c4', formattedContent]]);

    mockFromWorkspace.mockResolvedValue({
      format: vi.fn().mockResolvedValue(formatMap),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof LikeC4.fromWorkspace> extends Promise<infer T> ? T : never);

    const result = await formatLikeC4Dsl(
      '/workspace',
      '/workspace/model.c4',
      'model {a = service}'
    );

    expect(result.formatted).toBe(true);
    expect(result.content).toBe(formattedContent);
  });

  it('should return skipped when format method does not exist', async () => {
    mockFromWorkspace.mockResolvedValue({
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof LikeC4.fromWorkspace> extends Promise<infer T> ? T : never);

    const result = await formatLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result.formatted).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('should return skipped when SDK throws', async () => {
    mockFromWorkspace.mockRejectedValue(new Error('SDK unavailable'));

    const result = await formatLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result.formatted).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('should return error when target file not found in format result', async () => {
    const formatMap = new Map([['file:///tmp/erode-likec4-fmt-abc/other.c4', 'other content']]);

    mockFromWorkspace.mockResolvedValue({
      format: vi.fn().mockResolvedValue(formatMap),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof LikeC4.fromWorkspace> extends Promise<infer T> ? T : never);

    const result = await formatLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result.formatted).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should call dispose even when format throws', async () => {
    const disposeFn = vi.fn().mockResolvedValue(undefined);
    mockFromWorkspace.mockResolvedValue({
      format: vi.fn().mockRejectedValue(new Error('format failed')),
      dispose: disposeFn,
    } as unknown as ReturnType<typeof LikeC4.fromWorkspace> extends Promise<infer T> ? T : never);

    const result = await formatLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result.formatted).toBe(false);
    expect(result.skipped).toBe(true);
    expect(disposeFn).toHaveBeenCalled();
  });
});
