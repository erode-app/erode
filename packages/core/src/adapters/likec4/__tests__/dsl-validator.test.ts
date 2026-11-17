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
    projects: () => ['default'],
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

  it('should return warnings when the SDK reports them', async () => {
    mockFromWorkspace.mockResolvedValue(
      mockInstance({
        getWarnings: () => [{ message: 'Relationship has no title' }],
      }).instance
    );

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: true, warnings: ['Relationship has no title'] });
  });

  it('should omit warnings when getWarnings returns none', async () => {
    mockFromWorkspace.mockResolvedValue(mockInstance({ getWarnings: () => [] }).instance);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: true });
  });

  it('should stay valid when getWarnings throws', async () => {
    mockFromWorkspace.mockResolvedValue(
      mockInstance({
        getWarnings: () => {
          throw new Error('warnings unavailable');
        },
      }).instance
    );

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: true });
  });

  it('should omit warnings when the SDK has no getWarnings method', async () => {
    mockFromWorkspace.mockResolvedValue(mockInstance().instance);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).not.toHaveProperty('warnings');
  });

  it('should render a safe message for errors without one', async () => {
    mockFromWorkspace.mockResolvedValue(
      mockInstance({
        hasErrors: () => true,
        getErrors: () => [{ sourceFsPath: `${TMP}/model.c4` }],
      }).instance
    );

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result.errors).toEqual(['LikeC4 reported an error without a message']);
  });

  it('should keep a valid verdict when dispose rejects', async () => {
    const { instance, dispose } = mockInstance();
    dispose.mockRejectedValue(new Error('dispose failed'));
    mockFromWorkspace.mockResolvedValue(instance);

    const result = await validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}');

    expect(result).toEqual({ valid: true });
  });
});

const TMP = '/tmp/erode-likec4-validate-abc';

function warning(file: string, message: string) {
  return { message, line: 0, sourceFsPath: `${TMP}/${file}` };
}

describe('validateLikeC4Dsl with a validation baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function validateWith(current: unknown[], baseline?: { file?: string; message: string }[]) {
    mockFromWorkspace.mockResolvedValue(mockInstance({ getWarnings: () => current }).instance);
    return validateLikeC4Dsl('/workspace', '/workspace/model.c4', 'model {}', baseline);
  }

  it('should drop warnings present in the baseline and keep new ones', async () => {
    const result = await validateWith(
      [warning('model.c4', 'Old warning'), warning('model.c4', 'New warning')],
      [{ file: 'model.c4', message: 'Old warning' }]
    );

    expect(result).toEqual({ valid: true, warnings: ['model.c4: New warning'] });
  });

  it('should return no warnings when all are pre-existing', async () => {
    const result = await validateWith(
      [warning('views/a.c4', 'Old warning')],
      [{ file: 'views/a.c4', message: 'Old warning' }]
    );

    expect(result).toEqual({ valid: true });
  });

  it('should keep a warning whose message matches the baseline in another file', async () => {
    const result = await validateWith(
      [warning('other.c4', 'Old warning')],
      [{ file: 'model.c4', message: 'Old warning' }]
    );

    expect(result.warnings).toEqual(['other.c4: Old warning']);
  });

  it('should count duplicates so an extra identical warning is reported', async () => {
    const result = await validateWith(
      [warning('model.c4', 'Dup'), warning('model.c4', 'Dup')],
      [{ file: 'model.c4', message: 'Dup' }]
    );

    expect(result.warnings).toEqual(['model.c4: Dup']);
  });

  it('should report all warnings when no baseline is given', async () => {
    const result = await validateWith([warning('model.c4', 'A'), warning('model.c4', 'B')]);

    expect(result.warnings).toEqual(['model.c4: A', 'model.c4: B']);
  });

  it('should report all warnings when the baseline is empty', async () => {
    const result = await validateWith([warning('model.c4', 'A')], []);

    expect(result.warnings).toEqual(['model.c4: A']);
  });

  it('should not leak the temp dir path into warnings', async () => {
    const result = await validateWith([
      warning('nested/model.c4', 'A'),
      { sourceFsPath: `${TMP}/model.c4` },
      { message: 'Outside', sourceFsPath: '/elsewhere/x.c4' },
      'not an object',
    ]);

    expect(result.warnings).toEqual([
      'nested/model.c4: A',
      'model.c4: LikeC4 reported a warning without a message',
      'Outside',
      'LikeC4 reported a warning without a message',
    ]);
    expect(result.warnings?.join('\n')).not.toContain(TMP);
  });
});

// Runs last: it resets the module registry, detaching later tests from the likec4 mock
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
