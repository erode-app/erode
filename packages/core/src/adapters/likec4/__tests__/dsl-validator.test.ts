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

import { cp } from 'fs/promises';
import { LikeC4 } from 'likec4';
import { validateLikeC4Dsl } from '../dsl-validator.js';

type LikeC4Instance = Awaited<ReturnType<typeof LikeC4.fromWorkspace>>;

const mockFromWorkspace = vi.mocked(LikeC4.fromWorkspace);

function mockInstance(overrides: Record<string, unknown> = {}) {
  const dispose = vi.fn().mockResolvedValue(undefined);
  const instance = {
    hasErrors: () => false,
    getErrors: () => [],
    dispose,
    ...overrides,
  } as unknown as LikeC4Instance;
  return { instance, dispose };
}

describe('validateLikeC4Dsl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid when DSL has no errors', async () => {
    mockFromWorkspace.mockResolvedValue(mockInstance().instance);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: true });
  });

  it('should return invalid with errors when DSL has errors', async () => {
    mockFromWorkspace.mockResolvedValue(
      mockInstance({
        hasErrors: () => true,
        getErrors: () => [{ message: 'Syntax error at line 5' }],
      }).instance
    );

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'bad content');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Syntax error at line 5');
  });

  it('should return invalid, not skipped, when fromWorkspace throws', async () => {
    mockFromWorkspace.mockRejectedValue(new Error('Workspace crashed'));

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: false, errors: ['Workspace crashed'] });
  });

  it('should return invalid, not skipped, when the workspace copy fails', async () => {
    vi.mocked(cp).mockRejectedValueOnce(new Error('EACCES: permission denied'));

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: false, errors: ['EACCES: permission denied'] });
    expect(mockFromWorkspace).not.toHaveBeenCalled();
  });

  it('should dispose the instance after validation', async () => {
    const { instance, dispose } = mockInstance();
    mockFromWorkspace.mockResolvedValue(instance);

    await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('should dispose the instance when error inspection throws', async () => {
    const { instance, dispose } = mockInstance({
      hasErrors: () => {
        throw new Error('boom');
      },
    });
    mockFromWorkspace.mockResolvedValue(instance);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: false, errors: ['boom'] });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('should keep a valid verdict when dispose rejects', async () => {
    const { instance, dispose } = mockInstance();
    dispose.mockRejectedValue(new Error('dispose failed'));
    mockFromWorkspace.mockResolvedValue(instance);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: true });
  });
});

describe('validateLikeC4Dsl when the SDK cannot be imported', () => {
  it('should return skipped', async () => {
    vi.resetModules();
    vi.doMock('likec4', () => {
      throw new Error('Cannot find module likec4');
    });
    try {
      const { validateLikeC4Dsl: validate } = await import('../dsl-validator.js');

      const result = await validate('/workspace', '/workspace/model.c4', 'model {}');

      expect(result).toEqual({ valid: false, skipped: true });
    } finally {
      vi.doUnmock('likec4');
      vi.resetModules();
    }
  });
});
