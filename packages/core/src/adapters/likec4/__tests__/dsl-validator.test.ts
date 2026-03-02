import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('likec4', () => ({
  LikeC4: {
    fromWorkspace: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/erode-likec4-validate-abc'),
  cp: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { LikeC4 } from 'likec4';
import { validateLikeC4Dsl } from '../dsl-validator.js';

const mockFromWorkspace = vi.mocked(LikeC4.fromWorkspace);

describe('validateLikeC4Dsl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid when DSL has no errors', async () => {
    mockFromWorkspace.mockResolvedValue({
      hasErrors: () => false,
      getErrors: () => [],
    } as unknown as ReturnType<typeof LikeC4.fromWorkspace> extends Promise<infer T> ? T : never);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: true });
  });

  it('should return invalid with errors when DSL has errors', async () => {
    mockFromWorkspace.mockResolvedValue({
      hasErrors: () => true,
      getErrors: () => [{ message: 'Syntax error at line 5' }],
    } as unknown as ReturnType<typeof LikeC4.fromWorkspace> extends Promise<infer T> ? T : never);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'bad content');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Syntax error at line 5');
  });

  it('should return skipped when SDK throws', async () => {
    mockFromWorkspace.mockRejectedValue(new Error('SDK unavailable'));

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result.valid).toBe(false);
    expect(result.skipped).toBe(true);
  });
});
