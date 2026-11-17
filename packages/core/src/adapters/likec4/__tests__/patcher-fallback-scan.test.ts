import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal()),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { readFileSync, readdirSync } from 'fs';
import { LikeC4Patcher } from '../patcher.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

class TestPatcher extends LikeC4Patcher {
  public override findTargetFile(modelPath: string): string | null {
    return super.findTargetFile(modelPath);
  }
}

const QUALIFYING = "model {\n  a = service 'A'\n  a -> a\n}\n";

function mockTree(tree: Record<string, Record<string, boolean>>, contents: Record<string, string>) {
  mockReaddirSync.mockImplementation(((dir: string) =>
    Object.entries(tree[dir] ?? {}).map(([name, isDir]) => ({
      name,
      isDirectory: () => isDir,
    }))) as unknown as typeof readdirSync);
  mockReadFileSync.mockImplementation(
    ((file: string) => contents[file] ?? '') as unknown as typeof readFileSync
  );
}

describe('LikeC4Patcher fallback scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips node_modules and .git and prefers root files over nested ones', () => {
    mockTree(
      {
        '/ws': { node_modules: true, '.git': true, nested: true, 'model.c4': false },
        '/ws/nested': { 'a.c4': false },
      },
      {
        '/ws/model.c4': QUALIFYING,
        '/ws/nested/a.c4': QUALIFYING,
        '/ws/node_modules/x.c4': QUALIFYING,
      }
    );

    expect(new TestPatcher().findTargetFile('/ws')).toBe(join('/ws', 'model.c4'));
    const visited = mockReaddirSync.mock.calls.map((call) => String(call[0]));
    expect(visited).toEqual(['/ws', '/ws/nested']);
  });

  it('finds a qualifying file in a nested folder', () => {
    mockTree(
      {
        '/ws': { 'spec.c4': false, systems: true },
        '/ws/systems': { 'core.c4': false },
      },
      {
        '/ws/spec.c4': 'specification {\n  element service\n}\n',
        '/ws/systems/core.c4': QUALIFYING,
      }
    );

    expect(new TestPatcher().findTargetFile('/ws')).toBe(join('/ws', 'systems', 'core.c4'));
  });

  it('includes .likec4 files and skips unreadable folders', () => {
    mockTree(
      { '/ws': { locked: true, 'model.likec4': false } },
      { '/ws/model.likec4': QUALIFYING }
    );
    const listing = mockReaddirSync.getMockImplementation();
    mockReaddirSync.mockImplementation(((dir: string, opts: unknown) => {
      if (dir === join('/ws', 'locked')) throw new Error('EACCES');
      return (listing as (d: string, o: unknown) => unknown)(dir, opts);
    }) as unknown as typeof readdirSync);

    expect(new TestPatcher().findTargetFile('/ws')).toBe(join('/ws', 'model.likec4'));
  });

  it('skips files it cannot read', () => {
    mockTree({ '/ws': { 'broken.c4': false, 'model.c4': false } }, { '/ws/model.c4': QUALIFYING });
    const read = mockReadFileSync.getMockImplementation();
    mockReadFileSync.mockImplementation(((file: string, opts: unknown) => {
      if (file === join('/ws', 'broken.c4')) throw new Error('ENOENT');
      return (read as (f: string, o: unknown) => unknown)(file, opts);
    }) as unknown as typeof readFileSync);

    expect(new TestPatcher().findTargetFile('/ws')).toBe(join('/ws', 'model.c4'));
  });
});
