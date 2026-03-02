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
    const result = buildStructuredOutput(makeAnalysisResult(), 'Structurizr');

    expect(result.modelFormat).toBe('Structurizr');
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
});

describe('writeOutputToFile', () => {
  beforeEach(() => {
    mockWriteFileSync.mockClear();
  });

  it('should write JSON to the specified file', () => {
    const output = buildStructuredOutput(makeAnalysisResult(), 'LikeC4');
    writeOutputToFile(output, '/tmp/output.json');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).toHaveBeenCalledWith('/tmp/output.json', expect.any(String), 'utf-8');

    const call = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const writtenContent = JSON.parse(call[1]) as StructuredAnalysisOutput;
    expect(writtenContent.status).toBe('success');
  });

  it('should write pretty-printed JSON', () => {
    const output = buildStructuredOutput(makeAnalysisResult(), 'LikeC4');
    writeOutputToFile(output, '/tmp/output.json');

    const call = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const writtenJson = call[1];
    expect(writtenJson).toContain('\n');
    expect(writtenJson).toContain('  ');
  });
});

describe('formatErrorAsComment', () => {
  it('should show rate limit message for ApiError with 429 status', () => {
    const error = new ApiError('Resource exhausted', 429);
    const output = formatErrorAsComment(error);

    expect(output).toContain(':x: **Analysis unsuccessful**');
    expect(output).toContain('rate limit was hit');
    expect(output).toContain('re-run the check');
  });

  it('should show timeout message for ApiError with timeout', () => {
    const error = new ApiError('Request timeout', 408);
    const output = formatErrorAsComment(error);

    expect(output).toContain(':x: **Analysis unsuccessful**');
    expect(output).toContain('timed out');
    expect(output).toContain('try re-running');
  });

  it('should show config message for ConfigurationError', () => {
    const error = new ConfigurationError('Missing GEMINI_API_KEY');
    const output = formatErrorAsComment(error);

    expect(output).toContain(':x: **Analysis unsuccessful**');
    expect(output).toContain('configuration issue');
    expect(output).toContain('API keys and tokens');
  });

  it('should show generic message for unknown errors', () => {
    const error = new Error('Something broke');
    const output = formatErrorAsComment(error);

    expect(output).toContain(':x: **Analysis unsuccessful**');
    expect(output).toContain('unexpected error happened');
    expect(output).toContain('workflow logs');
  });

  it('should contain COMMENT_MARKER for upsert', () => {
    const error = new Error('test');
    const output = formatErrorAsComment(error);

    expect(output).toContain(COMMENT_MARKER);
  });

  it('should contain the erode footer', () => {
    const error = new Error('test');
    const output = formatErrorAsComment(error);

    expect(output).toContain('*Automated by [erode]');
  });
});

describe('analysisHasFindings', () => {
  it('should return true when violations are present', () => {
    const result = makeAnalysisResult({
      hasViolations: true,
      violations: [{ severity: 'high', description: 'test' }],
    });

    expect(analysisHasFindings(result)).toBe(true);
  });

  it('should return true when model updates have add-only changes', () => {
    const result = makeAnalysisResult({
      modelUpdates: { add: ['comp.a -> comp.b'], relationships: [] },
    });

    expect(analysisHasFindings(result)).toBe(true);
  });

  it('should return true when model updates have remove-only changes', () => {
    const result = makeAnalysisResult({
      modelUpdates: { remove: ['comp.x -> comp.y'], relationships: [] },
    });

    expect(analysisHasFindings(result)).toBe(true);
  });

  it('should return true when model updates have both add and remove changes', () => {
    const result = makeAnalysisResult({
      modelUpdates: {
        add: ['comp.a -> comp.b'],
        remove: ['comp.x -> comp.y'],
        relationships: [],
      },
    });

    expect(analysisHasFindings(result)).toBe(true);
  });

  it('should return false when no findings are present', () => {
    const result = makeAnalysisResult();

    expect(analysisHasFindings(result)).toBe(false);
  });

  it('should return false when modelUpdates is undefined', () => {
    const result = makeAnalysisResult({ modelUpdates: undefined });

    expect(analysisHasFindings(result)).toBe(false);
  });

  it('should return false when model updates have empty arrays', () => {
    const result = makeAnalysisResult({
      modelUpdates: { add: [], remove: [], relationships: [] },
    });

    expect(analysisHasFindings(result)).toBe(false);
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
});
