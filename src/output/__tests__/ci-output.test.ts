import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StructuredAnalysisOutput } from '../structured-output.js';

const { mockAppendFileSync } = vi.hoisted(() => ({
  mockAppendFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  appendFileSync: mockAppendFileSync,
}));

import {
  buildStepSummary,
  writeGitHubActionsOutputs,
  writeGitHubStepSummary,
} from '../ci-output.js';

function makeOutput(overrides: Partial<StructuredAnalysisOutput> = {}): StructuredAnalysisOutput {
  return {
    version: '1.0.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    status: 'success',
    exitCode: 0,
    metadata: {
      changeRequest: {
        number: 42,
        title: 'Test PR',
        author: 'dev',
        base: 'main',
        head: 'feature/test',
        commits: 1,
        filesChanged: 2,
      },
      component: {
        id: 'comp.api',
        name: 'API Service',
        type: 'service',
        tags: ['backend'],
      },
    },
    analysis: {
      hasViolations: false,
      violations: [],
      summary: 'No issues found',
    },
    ...overrides,
  };
}

describe('buildStepSummary', () => {
  it('renders success summary with no violations', () => {
    const md = buildStepSummary(makeOutput());

    expect(md).toContain('## Drift Detection Results');
    expect(md).toContain('### Analysis Completed Successfully');
    expect(md).toContain('No architectural drift detected');
    expect(md).toContain('`comp.api`');
    expect(md).toContain('API Service');
    expect(md).toContain('**Status:** success');
    expect(md).toContain('**Violations:** 0');
  });

  it('renders violations header when violations exist', () => {
    const md = buildStepSummary(
      makeOutput({
        status: 'violations',
        exitCode: 1,
        analysis: {
          hasViolations: true,
          violations: [
            {
              severity: 'high',
              description: 'Undeclared dependency on Redis',
              file: 'src/cache.ts',
              line: 5,
              commit: 'abc123',
            },
          ],
          summary: 'Found 1 violation',
        },
      })
    );

    expect(md).toContain('### Violations Detected');
    expect(md).toContain('### Architectural Violations');
    expect(md).toContain('**[HIGH]** Undeclared dependency on Redis');
    expect(md).toContain('**Violations:** 1');
  });

  it('renders warnings when present', () => {
    const md = buildStepSummary(
      makeOutput({
        analysis: {
          hasViolations: false,
          violations: [],
          summary: 'Some warnings',
          warnings: ['Consider adding tests', 'Missing docs'],
        },
      })
    );

    expect(md).toContain('### Warnings');
    expect(md).toContain('- Consider adding tests');
    expect(md).toContain('- Missing docs');
    expect(md).toContain('**Warnings:** 2');
  });

  it('renders model updates when present', () => {
    const md = buildStepSummary(
      makeOutput({
        analysis: {
          hasViolations: false,
          violations: [],
          summary: 'Model changes needed',
          modelUpdates: {
            add: ['redis -> comp.api', 'kafka -> comp.api'],
            remove: ['memcached -> comp.api'],
          },
        },
      })
    );

    expect(md).toContain('### Recommended Model Updates');
    expect(md).toContain('**Add (2):**');
    expect(md).toContain('- redis -> comp.api');
    expect(md).toContain('**Remove (1):**');
    expect(md).toContain('- memcached -> comp.api');
  });

  it('renders error status', () => {
    const md = buildStepSummary(makeOutput({ status: 'error', exitCode: 2 }));

    expect(md).toContain('### Analysis Failed');
  });

  it('renders skipped status', () => {
    const md = buildStepSummary(makeOutput({ status: 'skipped' }));

    expect(md).toContain('### Analysis Skipped');
  });
});

describe('writeGitHubActionsOutputs', () => {
  beforeEach(() => {
    mockAppendFileSync.mockClear();
  });

  it('writes outputs to GITHUB_OUTPUT file', () => {
    const original = process.env['GITHUB_OUTPUT'];
    process.env['GITHUB_OUTPUT'] = '/tmp/github-output';

    writeGitHubActionsOutputs(makeOutput());

    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    const [path, content] = mockAppendFileSync.mock.calls[0] as [string, string, string];
    expect(path).toBe('/tmp/github-output');
    expect(content).toContain('has-violations=false');
    expect(content).toContain('violations-count=0');
    expect(content).toContain('analysis-summary<<SUMMARY_EOF');
    expect(content).toContain('No issues found');
    expect(content).toContain('SUMMARY_EOF');

    if (original === undefined) {
      delete process.env['GITHUB_OUTPUT'];
    } else {
      process.env['GITHUB_OUTPUT'] = original;
    }
  });

  it('writes correct violation count', () => {
    const original = process.env['GITHUB_OUTPUT'];
    process.env['GITHUB_OUTPUT'] = '/tmp/github-output';

    writeGitHubActionsOutputs(
      makeOutput({
        analysis: {
          hasViolations: true,
          violations: [
            { severity: 'high', description: 'v1', file: null, line: null, commit: null },
            { severity: 'medium', description: 'v2', file: null, line: null, commit: null },
          ],
          summary: 'Found 2 violations',
        },
      })
    );

    const content = mockAppendFileSync.mock.calls[0]?.[1] as string;
    expect(content).toContain('has-violations=true');
    expect(content).toContain('violations-count=2');

    if (original === undefined) {
      delete process.env['GITHUB_OUTPUT'];
    } else {
      process.env['GITHUB_OUTPUT'] = original;
    }
  });

  it('does nothing when GITHUB_OUTPUT is not set', () => {
    const original = process.env['GITHUB_OUTPUT'];
    delete process.env['GITHUB_OUTPUT'];

    writeGitHubActionsOutputs(makeOutput());

    expect(mockAppendFileSync).not.toHaveBeenCalled();

    if (original !== undefined) {
      process.env['GITHUB_OUTPUT'] = original;
    }
  });
});

describe('writeGitHubStepSummary', () => {
  beforeEach(() => {
    mockAppendFileSync.mockClear();
  });

  it('writes step summary to GITHUB_STEP_SUMMARY file', () => {
    const original = process.env['GITHUB_STEP_SUMMARY'];
    process.env['GITHUB_STEP_SUMMARY'] = '/tmp/step-summary';

    writeGitHubStepSummary(makeOutput());

    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    const [path, content] = mockAppendFileSync.mock.calls[0] as [string, string, string];
    expect(path).toBe('/tmp/step-summary');
    expect(content).toContain('## Drift Detection Results');

    if (original === undefined) {
      delete process.env['GITHUB_STEP_SUMMARY'];
    } else {
      process.env['GITHUB_STEP_SUMMARY'] = original;
    }
  });

  it('does nothing when GITHUB_STEP_SUMMARY is not set', () => {
    const original = process.env['GITHUB_STEP_SUMMARY'];
    delete process.env['GITHUB_STEP_SUMMARY'];

    writeGitHubStepSummary(makeOutput());

    expect(mockAppendFileSync).not.toHaveBeenCalled();

    if (original !== undefined) {
      process.env['GITHUB_STEP_SUMMARY'] = original;
    }
  });
});
