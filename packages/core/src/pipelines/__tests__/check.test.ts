import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions ────────────────────────────────────────────────
const {
  mockLoadFromPath,
  mockFindAllComponentsByRepository,
  mockFindComponentById,
  mockGetComponentDependencies,
  mockGetComponentDependents,
  mockGetComponentRelationships,
  mockGetAllRelationships,
  mockSelectComponent,
  mockExtractDependencies,
  mockAnalyzeDrift,
  mockLoadSkipPatterns,
  mockApplySkipPatterns,
  mockValidatePath,
  mockBuildStructuredOutput,
} = vi.hoisted(() => ({
  mockLoadFromPath: vi.fn(),
  mockFindAllComponentsByRepository: vi.fn(),
  mockFindComponentById: vi.fn(),
  mockGetComponentDependencies: vi.fn(),
  mockGetComponentDependents: vi.fn(),
  mockGetComponentRelationships: vi.fn(),
  mockGetAllRelationships: vi.fn(),
  mockSelectComponent: vi.fn(),
  mockExtractDependencies: vi.fn(),
  mockAnalyzeDrift: vi.fn(),
  mockLoadSkipPatterns: vi.fn(),
  mockApplySkipPatterns: vi.fn(),
  mockValidatePath: vi.fn(),
  mockBuildStructuredOutput: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock('../../adapters/adapter-factory.js', () => ({
  createAdapter: vi.fn(() => ({
    metadata: {
      id: 'likec4',
      displayName: 'LikeC4',
      noComponentHelpLines: [],
      missingLinksHelpLines: [],
    },
    loadFromPath: mockLoadFromPath,
    findAllComponentsByRepository: mockFindAllComponentsByRepository,
    findComponentById: mockFindComponentById,
    getComponentDependencies: mockGetComponentDependencies,
    getComponentDependents: mockGetComponentDependents,
    getComponentRelationships: mockGetComponentRelationships,
    getAllRelationships: mockGetAllRelationships,
    getAllComponents: vi.fn(),
    isAllowedDependency: vi.fn(),
  })),
}));

vi.mock('../../providers/provider-factory.js', () => ({
  createAIProvider: vi.fn(() => ({
    selectComponent: mockSelectComponent,
    extractDependencies: mockExtractDependencies,
    analyzeDrift: mockAnalyzeDrift,
  })),
}));

vi.mock('../../utils/skip-patterns.js', () => ({
  loadSkipPatterns: mockLoadSkipPatterns,
  applySkipPatterns: mockApplySkipPatterns,
}));

vi.mock('../../utils/validation.js', () => ({
  validate: vi.fn((_schema: unknown, data: unknown) => data),
  validatePath: mockValidatePath,
}));

vi.mock('../../output.js', () => ({
  buildStructuredOutput: mockBuildStructuredOutput,
}));

import { runCheck, type CheckOptions } from '../check.js';

const testComponent = {
  id: 'cloud.api',
  name: 'API Service',
  type: 'service',
  tags: ['backend'],
  repository: 'https://github.com/org/api',
};

const testDiff = `diff --git a/src/client.ts b/src/client.ts
--- a/src/client.ts
+++ b/src/client.ts
@@ -1,3 +1,5 @@
+import { PaymentClient } from '@org/payments';
 export class Client {}`;

function baseOptions(): CheckOptions {
  return {
    modelPath: '/models/arch',
    diff: testDiff,
    repo: 'https://github.com/org/api',
    repoOwner: 'org',
    repoName: 'api',
    files: [{ filename: 'src/client.ts', status: 'modified' }],
    stats: { additions: 2, deletions: 0, filesChanged: 1 },
  };
}

describe('runCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadFromPath.mockResolvedValue({
      components: [testComponent],
      relationships: [],
      componentIndex: { byRepository: new Map(), byId: new Map([['cloud.api', testComponent]]) },
    });
    mockFindAllComponentsByRepository.mockReturnValue([testComponent]);
    mockGetComponentDependencies.mockReturnValue([]);
    mockGetComponentDependents.mockReturnValue([]);
    mockGetComponentRelationships.mockReturnValue([]);
    mockGetAllRelationships.mockReturnValue([]);
    mockLoadSkipPatterns.mockReturnValue([]);
    mockApplySkipPatterns.mockReturnValue({ included: [], excluded: 0 });
    mockExtractDependencies.mockResolvedValue({
      dependencies: [],
      summary: 'No dependencies',
    });
    mockAnalyzeDrift.mockResolvedValue({
      hasViolations: false,
      violations: [],
      summary: 'No drift found',
      metadata: {
        number: 0,
        title: 'Local changes',
        description: null,
        repository: 'org/api',
        author: { login: 'local' },
        base: { ref: 'HEAD', sha: '' },
        head: { ref: 'working-tree', sha: '' },
        stats: { commits: 0, additions: 2, deletions: 0, files_changed: 1 },
        commits: [],
      },
      component: testComponent,
      dependencyChanges: { dependencies: [], summary: '' },
    });
  });

  it('runs the full pipeline and returns no violations', async () => {
    const result = await runCheck(baseOptions());

    expect(result.hasViolations).toBe(false);
    expect(mockLoadFromPath).toHaveBeenCalledWith('/models/arch');
    expect(mockFindAllComponentsByRepository).toHaveBeenCalledWith('https://github.com/org/api');
    expect(mockExtractDependencies).toHaveBeenCalledOnce();
    expect(mockAnalyzeDrift).toHaveBeenCalledOnce();
  });

  it('returns violations when drift is found', async () => {
    mockAnalyzeDrift.mockResolvedValue({
      hasViolations: true,
      violations: [{ severity: 'high', description: 'Undeclared dependency on payments' }],
      summary: 'Drift detected',
      metadata: {
        number: 0,
        title: 'Local changes',
        description: null,
        repository: 'org/api',
        author: { login: 'local' },
        base: { ref: 'HEAD', sha: '' },
        head: { ref: 'working-tree', sha: '' },
        stats: { commits: 0, additions: 2, deletions: 0, files_changed: 1 },
        commits: [],
      },
      component: testComponent,
      dependencyChanges: { dependencies: [], summary: '' },
    });

    const result = await runCheck(baseOptions());

    expect(result.hasViolations).toBe(true);
    expect(result.analysisResult.violations).toHaveLength(1);
  });

  it('returns empty result when no components match', async () => {
    mockFindAllComponentsByRepository.mockReturnValue([]);

    const result = await runCheck(baseOptions());

    expect(result.hasViolations).toBe(false);
    expect(result.analysisResult.summary).toContain('No components found');
    expect(mockExtractDependencies).not.toHaveBeenCalled();
    expect(mockAnalyzeDrift).not.toHaveBeenCalled();
  });

  it('uses explicit component ID when provided', async () => {
    mockFindComponentById.mockReturnValue(testComponent);

    await runCheck({ ...baseOptions(), componentId: 'cloud.api' });

    expect(mockFindComponentById).toHaveBeenCalledWith('cloud.api');
    expect(mockSelectComponent).not.toHaveBeenCalled();
  });

  it('throws when explicit component ID is not found', async () => {
    mockFindComponentById.mockReturnValue(undefined);

    await expect(runCheck({ ...baseOptions(), componentId: 'nonexistent' })).rejects.toThrow(
      'Component not found: nonexistent'
    );
  });

  it('uses Stage 1 selection for multiple components', async () => {
    const comp2 = { ...testComponent, id: 'cloud.web', name: 'Web App' };
    mockFindAllComponentsByRepository.mockReturnValue([testComponent, comp2]);
    mockSelectComponent.mockResolvedValue('cloud.api');

    await runCheck(baseOptions());

    expect(mockSelectComponent).toHaveBeenCalledOnce();
    expect(mockExtractDependencies).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [testComponent],
      })
    );
  });

  it('passes local metadata to drift analysis', async () => {
    await runCheck(baseOptions());

    const call = mockAnalyzeDrift.mock.calls[0] as unknown[];
    const promptData = call[0] as { changeRequest: { number: number; title: string } };
    expect(promptData.changeRequest.number).toBe(0);
    expect(promptData.changeRequest.title).toBe('Local changes');
  });

  it('passes diff to dependency extraction', async () => {
    await runCheck(baseOptions());

    const call = mockExtractDependencies.mock.calls[0] as unknown[];
    const data = call[0] as {
      diff: string;
      commit: { sha: string };
      repository: { owner: string; repo: string };
    };
    expect(data.diff).toBe(testDiff);
    expect(data.commit.sha).toBe('local');
    expect(data.repository.owner).toBe('org');
    expect(data.repository.repo).toBe('api');
  });

  it('parses files from diff when files not provided', async () => {
    const { files: _files, ...opts } = baseOptions();

    await runCheck(opts);

    expect(mockAnalyzeDrift).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ filename: 'src/client.ts', status: 'modified' }],
      })
    );
  });

  it('skips file filtering when skipFileFiltering is true', async () => {
    await runCheck({ ...baseOptions(), skipFileFiltering: true });

    expect(mockLoadSkipPatterns).not.toHaveBeenCalled();
    expect(mockApplySkipPatterns).not.toHaveBeenCalled();
  });

  it('applies file filtering by default', async () => {
    mockLoadSkipPatterns.mockReturnValue(['*.test.ts']);
    mockApplySkipPatterns.mockReturnValue({
      included: [{ filename: 'src/client.ts', status: 'modified', additions: 0, deletions: 0, changes: 0 }],
      excluded: 0,
    });

    await runCheck(baseOptions());

    expect(mockLoadSkipPatterns).toHaveBeenCalledOnce();
    expect(mockApplySkipPatterns).toHaveBeenCalledOnce();
  });
});
