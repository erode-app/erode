import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectTargetFileByLocation } from '../target-file-selection.js';
import type { NewComponent, StructuredRelationship } from '../../analysis/analysis-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(
  __dirname,
  '..',
  'likec4',
  '__tests__',
  'fixtures',
  'multi-file-workspace'
);
const spec = path.join(workspace, 'spec.c4');
const core = path.join(workspace, 'systems', 'core.c4');
const edge = path.join(workspace, 'systems', 'edge.c4');

const files = new Map([
  ['shared', spec],
  ['core', core],
  ['core.orders', core],
  ['core.billing', core],
  ['edge', edge],
  ['edge.gateway', edge],
]);

function rel(source: string, target: string): StructuredRelationship {
  return { source, target, description: `${source} to ${target}` };
}

function comp(id: string): NewComponent {
  return { id, kind: 'service', name: id };
}

function select(
  relationships: StructuredRelationship[],
  newComponents: NewComponent[] = [],
  elementSourceFiles: ReadonlyMap<string, string> = files
): string | null {
  return selectTargetFileByLocation(workspace, {
    relationships,
    newComponents,
    elementSourceFiles,
  });
}

describe('selectTargetFileByLocation', () => {
  it('returns null without element locations', () => {
    expect(
      selectTargetFileByLocation(workspace, {
        relationships: [rel('edge.gateway', 'core.orders')],
        newComponents: [],
      })
    ).toBeNull();
    expect(select([rel('edge.gateway', 'core.orders')], [], new Map())).toBeNull();
  });

  it('falls back to the file declaring the most elements when nothing touched is located', () => {
    expect(select([rel('unknown.a', 'unknown.b')])).toBe(core);
    expect(select([], [comp('brand_new')])).toBe(core);
  });

  it('picks the file declaring the relationship source', () => {
    expect(select([rel('edge.gateway', 'core.orders')])).toBe(edge);
    expect(select([rel('core.orders', 'edge.gateway')])).toBe(core);
  });

  it('picks the majority file when relationships span files', () => {
    expect(
      select([
        rel('edge.gateway', 'core.orders'),
        rel('core.orders', 'shared'),
        rel('core.billing', 'shared'),
      ])
    ).toBe(core);
  });

  it('breaks ties by first vote', () => {
    expect(select([rel('shared', 'core'), rel('edge', 'core')])).toBe(spec);
  });

  it('uses the target file when the source is a new component', () => {
    expect(select([rel('newsvc', 'edge.gateway')], [comp('newsvc')])).toBe(edge);
  });

  it('places a nested new component with its parent', () => {
    expect(select([], [comp('core.inventory')])).toBe(core);
    expect(select([], [comp('edge.gateway.cache')])).toBe(edge);
  });

  it('places a top-level new component next to a related existing element', () => {
    expect(select([rel('edge.gateway', 'newsvc')], [comp('newsvc')])).toBe(edge);
    const rels = [rel('core.orders', 'newsvc')];
    expect(select(rels, [comp('newsvc')])).toBe(core);
  });

  it('ignores located files outside the model path or missing on disk', () => {
    const outside = new Map([
      ['edge.gateway', fileURLToPath(import.meta.url)],
      ['core.orders', path.join(workspace, 'systems', 'deleted.c4')],
    ]);
    expect(select([rel('edge.gateway', 'core.orders')], [], outside)).toBeNull();
  });

  it('accepts files in folders whose names start with two dots', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'erode-select-'));
    try {
      const file = path.join(root, '..shared', 'model.c4');
      mkdirSync(path.dirname(file));
      writeFileSync(file, 'model {}\n');
      const located = selectTargetFileByLocation(root, {
        relationships: [rel('a', 'b')],
        newComponents: [],
        elementSourceFiles: new Map([['a', file]]),
      });
      expect(located).toBe(file);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
