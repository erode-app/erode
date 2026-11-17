import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildDiffBlock, previewModelEdits } from '../model-edits.js';

interface MockDoc {
  uri: string;
  before: string;
  after: string;
}

const state: {
  hasModelEdits: boolean;
  preview: (dir: string, diffId: string) => unknown;
} = {
  hasModelEdits: true,
  preview: () => ({ error: 'not set' }),
};

const dispose = vi.fn(() => Promise.resolve());

vi.mock('likec4', () => ({
  LikeC4: {
    fromWorkspace: vi.fn((dir: string) =>
      Promise.resolve({
        dispose,
        modelDiffs: { list: () => Promise.resolve([{ id: currentDiffId }]) },
        modelEdits: state.hasModelEdits
          ? {
              preview: (req: { diffId: string }) => Promise.resolve(state.preview(dir, req.diffId)),
            }
          : undefined,
      })
    ),
  },
}));

let currentDiffId = '';
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal()),
  randomBytes: () => ({ toString: () => currentDiffId.replace('erode_', '') }),
}));

const fixture = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-workspace');

function doc(dir: string, file: string, before: string, after: string): MockDoc {
  return { uri: pathToFileURL(join(dir, file)).href, before, after };
}

describe('buildDiffBlock', () => {
  it('wraps relationships in a diff add block', () => {
    const block = buildDiffBlock('erode_x', [], ["  a -> b 'uses'"]);
    expect(block).toBe(
      ['diff erode_x {', '  add {', "    a -> b 'uses'", '  }', '}', ''].join('\n')
    );
  });

  it('nests dotted component IDs under extend', () => {
    const block = buildDiffBlock(
      'erode_x',
      [{ id: 'shop.cache', kind: 'service', name: "Bob's Cache", technology: 'Redis' }],
      []
    );
    expect(block).toContain('    extend shop {');
    expect(block).toContain("      cache = service 'Bob\\'s Cache' {");
    expect(block).toContain("        technology 'Redis'");
  });

  it('defines top-level components directly', () => {
    const block = buildDiffBlock(
      'erode_x',
      [{ id: 'cache', kind: 'service', name: 'Cache', tags: ['new'] }],
      []
    );
    expect(block).toContain("    cache = service 'Cache' {");
    expect(block).toContain('      #new');
  });
});

describe('previewModelEdits', () => {
  beforeEach(() => {
    currentDiffId = 'erode_abcd1234';
    state.hasModelEdits = true;
    dispose.mockClear();
  });

  it('returns the single changed model file re-rooted on the model path', async () => {
    state.preview = (dir, id) => ({
      documents: [
        doc(dir, 'model.c4', 'model {}', "model {\n  a -> b 'uses'\n}"),
        doc(dir, `${id}.c4`, 'diff ...', ''),
      ],
      overlaps: [],
    });
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({
      ok: true,
      patch: { targetFile: join(fixture, 'model.c4'), content: "model {\n  a -> b 'uses'\n}" },
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('fails when the SDK has no modelEdits API', async () => {
    state.hasModelEdits = false;
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'likec4 SDK has no modelEdits API' });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('fails when preview reports an error', async () => {
    state.preview = () => ({ error: 'Diff has errors' });
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'Diff has errors' });
  });

  it('fails when the changed file is outside the workspace', async () => {
    state.preview = () => ({
      documents: [
        { uri: pathToFileURL(join(fixture, '..', 'other.c4')).href, before: 'x', after: 'y' },
      ],
      overlaps: [],
    });
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'changed file is outside the workspace' });
  });

  it('disposes the SDK and fails when preview throws', async () => {
    state.preview = () => {
      throw new Error('preview crashed');
    };
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'preview crashed' });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('fails on overlaps with other diffs', async () => {
    state.preview = (dir) => ({
      documents: [doc(dir, 'model.c4', 'x', 'y')],
      overlaps: ['rfc1: a -> b'],
    });
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'overlaps: rfc1: a -> b' });
  });

  it('fails when more than one model file changes', async () => {
    state.preview = (dir) => ({
      documents: [doc(dir, 'model.c4', 'x', 'y'), doc(dir, '_spec.c4', 'x', 'y')],
      overlaps: [],
    });
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'expected one changed model file, got 2' });
  });

  it('fails when a model file would be deleted', async () => {
    state.preview = (dir) => ({ documents: [doc(dir, 'model.c4', 'x', '')], overlaps: [] });
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'preview deletes a model file' });
  });

  it('fails on an unexpected preview shape', async () => {
    state.preview = () => ({ documents: 'nope' });
    const result = await previewModelEdits(fixture, [], ["a -> b 'uses'"]);
    expect(result).toEqual({ ok: false, reason: 'unexpected modelEdits.preview result' });
  });
});
