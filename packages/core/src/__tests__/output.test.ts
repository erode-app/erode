import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DriftAnalysisResult } from '../analysis/analysis-types.js';
import type { StructuredAnalysisOutput } from '../output/structured-output.js';

const { mockWriteFileSync, originalReadFileSync } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as Record<string, unknown>;
  return {
    mockWriteFileSync: vi.fn(),
    originalReadFileSync: fs['readFileSync'],
  };
});

// Mock fs.writeFileSync while preserving readFileSync for version detection
vi.mock('fs', () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: originalReadFileSync,
}));

import {
  buildStructuredOutput,
  formatAnalysisAsComment,
  formatErrorAsComment,
  formatPatchPrBody,
  COMMENT_MARKER,
  writeOutputToFile,
  analysisHasFindings,
} from '../output.js';
import { ApiError, ConfigurationError } from '../errors.js';

function makeAnalysisResult(overrides: Partial<DriftAnalysisResult> = {}): DriftAnalysisResult {
  return {
    hasViolations: false,
    violations: [],
    summary: 'No issues found',
    metadata: {
      number: 42,
      title: 'Test PR',
      description: null,
      repository: 'org/repo',
      author: { login: 'dev', name: 'Test Dev' },
      base: { ref: 'main', sha: 'base123' },
      head: { ref: 'feature/test', sha: 'head456' },
      stats: { commits: 1, additions: 10, deletions: 5, files_changed: 2 },
      commits: [{ sha: 'head456', message: 'Test commit', author: 'dev' }],
    },
    component: {
      id: 'comp.api',
      name: 'API Service',
      type: 'service',
      tags: ['backend'],
    },
    dependencyChanges: {
      dependencies: [],
      summary: 'No changes',
    },
    ...overrides,
  };
}

describe('buildStructuredOutput', () => {
  it('should return success status when no violations', () => {
    const result = buildStructuredOutput(makeAnalysisResult(), 'LikeC4');
    expect(result.status).toBe('success');
    expect(result.exitCode).toBe(0);
    expect(result.version).toBe('0.0.1');
    expect(result.analysis.hasViolations).toBe(false);
  });

  it('should return violations status when violations exist', () => {
    const result = buildStructuredOutput(
      makeAnalysisResult({
        hasViolations: true,
        violations: [
          {
            severity: 'high',
            description: 'Undeclared dependency',
            file: 'src/index.ts',
            line: 10,
            commit: 'abc123',
          },
        ],
      }),
      'LikeC4'
    );
    expect(result.status).toBe('violations');
    expect(result.exitCode).toBe(1);
    expect(result.analysis.violations).toHaveLength(1);
    expect(result.analysis.violations[0]?.severity).toBe('high');
  });

  it('should include metadata about PR and component', () => {
    const result = buildStructuredOutput(makeAnalysisResult(), 'LikeC4');
    expect(result.metadata.changeRequest?.number).toBe(42);
    expect(result.metadata.changeRequest?.title).toBe('Test PR');
    expect(result.metadata.component?.id).toBe('comp.api');
  });

  it('should include extras when provided', () => {
    const result = buildStructuredOutput(makeAnalysisResult(), 'LikeC4', {
      selectedComponentId: 'comp.api',
      candidateComponents: [{ id: 'comp.api', name: 'API', type: 'service' }],
      generatedChangeRequest: {
        url: 'https://github.com/org/repo/pull/1',
        number: 1,
        action: 'created',
        branch: 'drift/42',
      },
    });
    expect(result.selectedComponentId).toBe('comp.api');
    expect(result.candidateComponents).toHaveLength(1);
    expect(result.generatedChangeRequest?.action).toBe('created');
  });

  it('should include modelFormat', () => {
    expect(buildStructuredOutput(makeAnalysisResult(), 'Structurizr').modelFormat).toBe(
      'Structurizr'
    );
  });

  it('should include dependency changes', () => {
    const result = buildStructuredOutput(
      makeAnalysisResult({
        dependencyChanges: {
          dependencies: [
            {
              type: 'added',
              file: 'src/cache.ts',
              dependency: 'redis',
              description: 'Added Redis',
              code: '',
            },
          ],
          summary: 'Added Redis',
        },
      }),
      'LikeC4'
    );

    expect(result.dependencyChanges).toHaveLength(1);
    expect(result.dependencyChanges?.[0]?.dependency).toBe('redis');
  });
});

describe('formatAnalysisAsComment', () => {
  it('should show warning emoji when violations exist', () => {
    const output = formatAnalysisAsComment(
      makeAnalysisResult({
        hasViolations: true,
        violations: [{ severity: 'high', description: 'Undeclared dep' }],
      })
    );

    expect(output).toContain('**Status**: :warning: Issues detected');
    expect(output).not.toContain('**Status**: violations');
  });

  it('should show checkmark emoji when no violations', () => {
    const output = formatAnalysisAsComment(makeAnalysisResult());

    expect(output).toContain('**Status**: :white_check_mark: No drift found');
    expect(output).not.toContain('**Status**: success');
  });

  it('should wrap candidate components in a details tag', () => {
    const output = formatAnalysisAsComment(makeAnalysisResult(), {
      selectedComponentId: 'comp.api',
      candidateComponents: [
        { id: 'comp.api', name: 'API Service', type: 'service' },
        { id: 'comp.web', name: 'Web App', type: 'webapp' },
        { id: 'comp.worker', name: 'Worker', type: 'service' },
      ],
    });

    expect(output).toContain('<details>');
    expect(output).toContain('<summary>Selected from 3 candidates</summary>');
    expect(output).toContain('- [x] `comp.api` (API Service)');
    expect(output).toContain('- [ ] `comp.web` (Web App)');
    expect(output).toContain('</details>');
  });

  it('should not show candidates details when only one component', () => {
    const output = formatAnalysisAsComment(makeAnalysisResult(), {
      selectedComponentId: 'comp.api',
      candidateComponents: [{ id: 'comp.api', name: 'API Service', type: 'service' }],
    });

    expect(output).not.toContain('Selected from');
  });

  it('should render model metadata in a details section', () => {
    const output = formatAnalysisAsComment(makeAnalysisResult(), {
      modelInfo: {
        provider: 'gemini',
        fastModel: 'gemini-2.5-flash',
        advancedModel: 'gemini-2.5-pro',
      },
    });

    expect(output).toContain('<summary>Analysis details</summary>');
    expect(output).toContain('| **AI Provider** | gemini |');
    expect(output).toContain('| **Quick model** (Stages 1, 2) | `gemini-2.5-flash` |');
    expect(output).toContain('| **Deep model** (Stage 3) | `gemini-2.5-pro` |');
  });

  it('should not render model metadata when modelInfo is omitted', () => {
    const output = formatAnalysisAsComment(makeAnalysisResult());

    expect(output).not.toContain('Analysis details');
  });

  it('should show CTA when model updates exist, githubActions is true, and no generatedChangeRequest', () => {
    const output = formatAnalysisAsComment(
      makeAnalysisResult({
        modelUpdates: { add: ['comp.a -> comp.b'], relationships: [] },
      }),
      { githubActions: true }
    );

    expect(output).toContain('Reply `/erode update-model` on this PR to open a model update PR.');
  });

  it('should not show CTA when generatedChangeRequest is present', () => {
    const output = formatAnalysisAsComment(
      makeAnalysisResult({
        modelUpdates: { add: ['comp.a -> comp.b'], relationships: [] },
      }),
      {
        githubActions: true,
        generatedChangeRequest: {
          url: 'https://github.com/org/model/pull/1',
          number: 1,
          action: 'created',
          branch: 'erode/org-repo/pr-42',
        },
      }
    );

    expect(output).not.toContain('Reply `/erode update-model`');
  });

  it('should not show CTA when githubActions is not set', () => {
    const output = formatAnalysisAsComment(
      makeAnalysisResult({
        modelUpdates: { add: ['comp.a -> comp.b'], relationships: [] },
      })
    );

    expect(output).not.toContain('Reply `/erode update-model`');
  });

  it('should render new components section when newComponents are present', () => {
    const output = formatAnalysisAsComment(
      makeAnalysisResult({
        modelUpdates: {
          newComponents: [{ id: 'order_service', kind: 'service', name: 'Order Service' }],
        },
      })
    );

    expect(output).toContain(':new: New Components Detected');
    expect(output).toContain('`order_service`');
    expect(output).toContain('service');
    expect(output).toContain('Order Service');
    expect(output).toContain('auto-detected');
  });

  it('should not render new components section when newComponents is empty', () => {
    const output = formatAnalysisAsComment(
      makeAnalysisResult({
        modelUpdates: { newComponents: [] },
      })
    );

    expect(output).not.toContain('New Components Detected');
  });
});

describe('writeOutputToFile', () => {
  beforeEach(() => mockWriteFileSync.mockClear());

  it('should write pretty-printed JSON to the specified file', () => {
    writeOutputToFile(buildStructuredOutput(makeAnalysisResult(), 'LikeC4'), '/tmp/output.json');
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).toHaveBeenCalledWith('/tmp/output.json', expect.any(String), 'utf-8');
    const writtenJson = (mockWriteFileSync.mock.calls[0] as [string, string, string])[1];
    expect((JSON.parse(writtenJson) as StructuredAnalysisOutput).status).toBe('success');
    expect(writtenJson).toContain('\n');
  });
});

describe('formatErrorAsComment', () => {
  it.each([
    [new ApiError('Resource exhausted', 429), 'rate limit was hit'],
    [new ApiError('Request timeout', 408), 'timed out'],
    [new ConfigurationError('Missing key'), 'configuration issue'],
    [new Error('Something broke'), 'unexpected error happened'],
  ])('shows appropriate message for %s', (error, expectedText) => {
    const output = formatErrorAsComment(error);
    expect(output).toContain(':x: **Analysis unsuccessful**');
    expect(output).toContain(expectedText);
    expect(output).toContain(COMMENT_MARKER);
    expect(output).toContain('*Automated by [erode]');
  });
});

describe('analysisHasFindings', () => {
  it.each([
    [
      'violations present',
      { hasViolations: true, violations: [{ severity: 'high', description: 'test' }] },
      true,
    ],
    ['add-only model updates', { modelUpdates: { add: ['a -> b'], relationships: [] } }, true],
    [
      'remove-only model updates',
      { modelUpdates: { remove: ['x -> y'], relationships: [] } },
      true,
    ],
    [
      'add + remove model updates',
      { modelUpdates: { add: ['a -> b'], remove: ['x -> y'], relationships: [] } },
      true,
    ],
    [
      'newComponents present',
      { modelUpdates: { newComponents: [{ id: 'svc', kind: 'service', name: 'Svc' }] } },
      true,
    ],
    ['no findings', {}, false],
    ['undefined modelUpdates', { modelUpdates: undefined }, false],
    [
      'empty model update arrays',
      { modelUpdates: { add: [], remove: [], relationships: [] } },
      false,
    ],
  ] as const)('returns %s => %s', (_label, overrides, expected) => {
    expect(analysisHasFindings(makeAnalysisResult(overrides as Partial<DriftAnalysisResult>))).toBe(
      expected
    );
  });
});

describe('formatPatchPrBody', () => {
  it('should escape markdown link characters in prTitle', () => {
    const body = formatPatchPrBody({
      prNumber: 42,
      prTitle: 'Fix](evil) [Click here](https://evil.com/phish',
      prUrl: 'https://github.com/org/repo/pull/42',
      summary: 'Summary',
      insertedLines: ['  a -> b'],
      skipped: [],
    });

    // The title should have brackets/parens escaped
    expect(body).not.toContain('](evil)');
    expect(body).toContain('\\]');
    expect(body).toContain('\\(');
    // The actual link to the PR should still work
    expect(body).toContain('https://github.com/org/repo/pull/42');
  });

  it('should render normally with safe titles', () => {
    const body = formatPatchPrBody({
      prNumber: 10,
      prTitle: 'Add user auth',
      prUrl: 'https://github.com/org/repo/pull/10',
      summary: 'Added auth',
      insertedLines: ['  a -> b'],
      skipped: [],
    });

    expect(body).toContain('[PR #10: Add user auth](https://github.com/org/repo/pull/10)');
  });

  it.each([
    { title: 'Fix `code` injection', escaped: '\\`code\\`', absent: '`code`' },
    { title: 'Fix <script>alert(1)</script>', escaped: '\\<script\\>', absent: '<script>' },
    { title: 'Fix path\\to\\file', escaped: '\\\\', absent: undefined },
    { title: 'Fix table | injection', escaped: '\\|', absent: undefined },
  ])('should escape special chars in PR title: $title', ({ title, escaped, absent }) => {
    const body = formatPatchPrBody({
      prNumber: 42,
      prTitle: title,
      prUrl: 'https://github.com/org/repo/pull/42',
      summary: 'Summary',
      insertedLines: ['  a -> b'],
      skipped: [],
    });
    expect(body).toContain(escaped);
    if (absent) expect(body).not.toContain(absent);
  });

  it('should render new components section in PR body', () => {
    const body = formatPatchPrBody({
      prNumber: 42,
      prTitle: 'Add order service',
      prUrl: 'https://github.com/org/repo/pull/42',
      summary: 'Added order service',
      insertedLines: ['  customer -> order_service'],
      skipped: [],
      newComponents: [
        {
          id: 'order_service',
          kind: 'service',
          name: 'Order Service',
          insertedLines: ["  order_service = service 'Order Service' {", '  }'],
        },
      ],
    });

    expect(body).toContain(':new: New Components');
    expect(body).toContain('`order_service`');
    expect(body).toContain('service');
    expect(body).toContain('Order Service');
    expect(body).toContain('Review carefully');
  });

  it('should only show relationship lines in Applied Relationships when relationshipLines is provided', () => {
    const body = formatPatchPrBody({
      prNumber: 42,
      prTitle: 'Add order service',
      prUrl: 'https://github.com/org/repo/pull/42',
      summary: 'Added order service',
      insertedLines: [
        "  order_service = service 'Order Service' {",
        '  }',
        '  customer -> order_service',
      ],
      relationshipLines: ['  customer -> order_service'],
      skipped: [],
      newComponents: [
        {
          id: 'order_service',
          kind: 'service',
          name: 'Order Service',
          insertedLines: ["  order_service = service 'Order Service' {", '  }'],
        },
      ],
    });

    // The relationship table should only contain the relationship line
    expect(body).toContain('| `customer -> order_service` |');
    // Component DSL should NOT appear in the Applied Relationships table
    expect(body).not.toContain("| `order_service = service 'Order Service' {` |");
  });

  it('should fall back to insertedLines when relationshipLines is not provided', () => {
    const body = formatPatchPrBody({
      prNumber: 10,
      prTitle: 'Add deps',
      prUrl: 'https://github.com/org/repo/pull/10',
      summary: 'Added deps',
      insertedLines: ['  a -> b', '  c -> d'],
      skipped: [],
    });

    expect(body).toContain('| `a -> b` |');
    expect(body).toContain('| `c -> d` |');
  });

  it('should not render new components section when empty', () => {
    const body = formatPatchPrBody({
      prNumber: 10,
      prTitle: 'Update deps',
      prUrl: 'https://github.com/org/repo/pull/10',
      summary: 'Updated dependencies',
      insertedLines: ['  a -> b'],
      skipped: [],
      newComponents: [],
    });

    expect(body).not.toContain('New Components');
  });
});
