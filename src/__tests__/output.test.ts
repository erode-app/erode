import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DriftAnalysisResult } from '../analysis/analysis-types.js';
import type { StructuredAnalysisOutput } from '../output/structured-output.js';

const { mockWriteFileSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
}));

// Mock chalk to return plain strings for testability
vi.mock('chalk', () => {
  const passthrough = (s: string) => s;
  const handler: ProxyHandler<object> = {
    get: () => new Proxy(passthrough, handler),
    apply: (_target, _thisArg, args: string[]) => args[0],
  };
  return { default: new Proxy(passthrough, handler) };
});

// Mock fs.writeFileSync
vi.mock('fs', () => ({
  writeFileSync: mockWriteFileSync,
}));

import {
  buildStructuredOutput,
  formatAnalysisForConsole,
  formatAnalysisAsComment,
  writeOutputToFile,
} from '../output.js';

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
    const result = buildStructuredOutput(makeAnalysisResult());

    expect(result.status).toBe('success');
    expect(result.exitCode).toBe(0);
    expect(result.version).toBe('1.0.0');
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
      })
    );

    expect(result.status).toBe('violations');
    expect(result.exitCode).toBe(1);
    expect(result.analysis.violations).toHaveLength(1);
    expect(result.analysis.violations[0]?.severity).toBe('high');
  });

  it('should include metadata about PR and component', () => {
    const result = buildStructuredOutput(makeAnalysisResult());

    expect(result.metadata.changeRequest?.number).toBe(42);
    expect(result.metadata.changeRequest?.title).toBe('Test PR');
    expect(result.metadata.component?.id).toBe('comp.api');
  });

  it('should include extras when provided', () => {
    const result = buildStructuredOutput(makeAnalysisResult(), {
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
      })
    );

    expect(result.dependencyChanges).toHaveLength(1);
    expect(result.dependencyChanges?.[0]?.dependency).toBe('redis');
  });
});

describe('formatAnalysisForConsole', () => {
  it('should include PR number and title', () => {
    const output = formatAnalysisForConsole(makeAnalysisResult());

    expect(output).toContain('#42');
    expect(output).toContain('Test PR');
  });

  it('should include component info', () => {
    const output = formatAnalysisForConsole(makeAnalysisResult());

    expect(output).toContain('API Service');
    expect(output).toContain('comp.api');
  });

  it('should show "No violations found" when none exist', () => {
    const output = formatAnalysisForConsole(makeAnalysisResult());

    expect(output).toContain('No violations found');
  });

  it('should display violations with severity', () => {
    const output = formatAnalysisForConsole(
      makeAnalysisResult({
        hasViolations: true,
        violations: [
          {
            severity: 'high',
            description: 'Undeclared dependency on Redis',
            file: 'src/cache.ts',
            line: 5,
            commit: 'abc1234',
            suggestion: 'Add redis to model',
          },
        ],
      })
    );

    expect(output).toContain('Violations (1)');
    expect(output).toContain('[HIGH]');
    expect(output).toContain('Undeclared dependency on Redis');
    expect(output).toContain('src/cache.ts');
    expect(output).toContain('Suggestion: Add redis to model');
  });

  it('should display improvements when present', () => {
    const output = formatAnalysisForConsole(
      makeAnalysisResult({ improvements: ['Good use of caching'] })
    );

    expect(output).toContain('Improvements');
    expect(output).toContain('Good use of caching');
  });

  it('should display warnings when present', () => {
    const output = formatAnalysisForConsole(
      makeAnalysisResult({ warnings: ['Consider adding tests'] })
    );

    expect(output).toContain('Warnings');
    expect(output).toContain('Consider adding tests');
  });

  it('should display model updates when present', () => {
    const output = formatAnalysisForConsole(
      makeAnalysisResult({
        modelUpdates: {
          add: ['redis -> comp.api'],
          remove: ['memcached -> comp.api'],
          notes: 'Cache migration',
        },
      })
    );

    expect(output).toContain('Model Updates');
    expect(output).toContain('redis -> comp.api');
    expect(output).toContain('memcached -> comp.api');
    expect(output).toContain('Cache migration');
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

    expect(output).toContain('**Status**: :warning: Violations detected');
    expect(output).not.toContain('**Status**: violations');
  });

  it('should show checkmark emoji when no violations', () => {
    const output = formatAnalysisAsComment(makeAnalysisResult());

    expect(output).toContain('**Status**: :white_check_mark: No drift detected');
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

    expect(output).toContain('<summary>Analysis metadata</summary>');
    expect(output).toContain('| **Provider** | gemini |');
    expect(output).toContain('| **Fast model** (Stage 0, 1) | `gemini-2.5-flash` |');
    expect(output).toContain('| **Advanced model** (Stage 2, 3) | `gemini-2.5-pro` |');
  });

  it('should not render model metadata when modelInfo is omitted', () => {
    const output = formatAnalysisAsComment(makeAnalysisResult());

    expect(output).not.toContain('Analysis metadata');
  });
});

describe('writeOutputToFile', () => {
  beforeEach(() => {
    mockWriteFileSync.mockClear();
  });

  it('should write JSON to the specified file', () => {
    const output = buildStructuredOutput(makeAnalysisResult());
    writeOutputToFile(output, '/tmp/output.json');

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).toHaveBeenCalledWith('/tmp/output.json', expect.any(String), 'utf-8');

    const call = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const writtenContent = JSON.parse(call[1]) as StructuredAnalysisOutput;
    expect(writtenContent.status).toBe('success');
  });

  it('should write pretty-printed JSON', () => {
    const output = buildStructuredOutput(makeAnalysisResult());
    writeOutputToFile(output, '/tmp/output.json');

    const call = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const writtenJson = call[1];
    expect(writtenJson).toContain('\n');
    expect(writtenJson).toContain('  ');
  });
});
