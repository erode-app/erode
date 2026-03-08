import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions ────────────────────────────────────────────────
const {
  mockLoadFromPath,
  mockFindAllComponentsByRepository,
  mockGetComponentDependencies,
  mockGetComponentDependents,
  mockGetComponentRelationships,
  mockValidatePath,
  mockCreateAdapter,
} = vi.hoisted(() => ({
  mockLoadFromPath: vi.fn().mockResolvedValue({}),
  mockFindAllComponentsByRepository: vi.fn(),
  mockGetComponentDependencies: vi.fn().mockReturnValue([]),
  mockGetComponentDependents: vi.fn().mockReturnValue([]),
  mockGetComponentRelationships: vi.fn().mockReturnValue([]),
  mockValidatePath: vi.fn(),
  mockCreateAdapter: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────

const mockAdapter = {
  metadata: { displayName: 'LikeC4' },
  loadFromPath: mockLoadFromPath,
  findAllComponentsByRepository: mockFindAllComponentsByRepository,
  getComponentDependencies: mockGetComponentDependencies,
  getComponentDependents: mockGetComponentDependents,
  getComponentRelationships: mockGetComponentRelationships,
};

mockCreateAdapter.mockReturnValue(mockAdapter);

vi.mock('../../adapters/adapter-factory.js', () => ({
  createAdapter: mockCreateAdapter,
}));

vi.mock('../../utils/validation.js', () => ({
  validatePath: mockValidatePath,
}));

vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    debug: { verbose: false },
    adapter: { likec4: { excludePaths: [], excludeTags: [] } },
  },
}));

import { runConnections } from '../connections.js';
import type { ArchitecturalComponent } from '../../adapters/architecture-types.js';

// ── Test data builders ────────────────────────────────────────────────────

function makeComponent(
  id = 'comp.api',
  name = 'API Service'
): ArchitecturalComponent {
  return {
    id,
    name,
    type: 'service',
    tags: [],
    repository: 'https://github.com/org/repo',
  };
}

function makeOptions(overrides: Partial<{ modelPath: string; modelFormat: string; repo: string }> = {}) {
  return {
    modelPath: '/path/to/model',
    repo: 'org/repo',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('runConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdapter.mockReturnValue(mockAdapter);
    mockLoadFromPath.mockResolvedValue({});
    mockFindAllComponentsByRepository.mockReturnValue([]);
    mockGetComponentDependencies.mockReturnValue([]);
    mockGetComponentDependents.mockReturnValue([]);
    mockGetComponentRelationships.mockReturnValue([]);
    mockValidatePath.mockReturnValue(undefined);
  });

  it('returns connections for single component with deps, dependents, relationships', async () => {
    const component = makeComponent('comp.api', 'API Service');
    const dep = makeComponent('comp.db', 'Database');
    const dependent = makeComponent('comp.web', 'Web App');

    mockFindAllComponentsByRepository.mockReturnValue([component]);
    mockGetComponentDependencies.mockReturnValue([dep]);
    mockGetComponentDependents.mockReturnValue([dependent]);
    mockGetComponentRelationships.mockReturnValue([
      {
        target: { id: 'comp.db', name: 'Database', type: 'service', tags: [] },
        kind: 'uses',
        title: 'reads data from',
      },
    ]);

    const results = await runConnections(makeOptions());

    expect(results).toHaveLength(1);
    expect(results[0]?.component).toEqual({
      id: 'comp.api',
      name: 'API Service',
      type: 'service',
      repository: 'https://github.com/org/repo',
    });
    expect(results[0]?.dependencies).toEqual([
      {
        id: 'comp.db',
        name: 'Database',
        type: 'service',
        repository: 'https://github.com/org/repo',
      },
    ]);
    expect(results[0]?.dependents).toEqual([
      {
        id: 'comp.web',
        name: 'Web App',
        type: 'service',
        repository: 'https://github.com/org/repo',
      },
    ]);
    expect(results[0]?.relationships).toEqual([
      {
        targetId: 'comp.db',
        targetName: 'Database',
        kind: 'uses',
        title: 'reads data from',
      },
    ]);
  });

  it('returns connections for multiple components', async () => {
    const comp1 = makeComponent('comp.api', 'API Service');
    const comp2 = makeComponent('comp.worker', 'Worker Service');

    mockFindAllComponentsByRepository.mockReturnValue([comp1, comp2]);

    const results = await runConnections(makeOptions());

    expect(results).toHaveLength(2);
    expect(results[0]?.component.id).toBe('comp.api');
    expect(results[1]?.component.id).toBe('comp.worker');
  });

  it('returns [] and calls progress.warn when no components found', async () => {
    mockFindAllComponentsByRepository.mockReturnValue([]);

    const mockProgress = {
      section: vi.fn(),
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    };

    const results = await runConnections(makeOptions(), mockProgress);

    expect(results).toEqual([]);
    expect(mockProgress.warn).toHaveBeenCalledWith(
      'No components found for repository: org/repo'
    );
  });

  it('passes modelFormat to createAdapter', async () => {
    mockFindAllComponentsByRepository.mockReturnValue([]);

    await runConnections(makeOptions({ modelFormat: 'structurizr' }));

    expect(mockCreateAdapter).toHaveBeenCalledWith('structurizr');
  });

  it('calls validatePath with modelPath and "directory"', async () => {
    mockFindAllComponentsByRepository.mockReturnValue([]);

    await runConnections(makeOptions({ modelPath: '/custom/model/path' }));

    expect(mockValidatePath).toHaveBeenCalledWith('/custom/model/path', 'directory');
  });
});
