import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ErrorCode } from '../../../errors.js';

const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = { create: mockCreate };
    },
  };
});

import { OpenAIProvider } from '../provider.js';
import type { DriftAnalysisPromptData } from '../../../analysis/analysis-types.js';

const driftData: DriftAnalysisPromptData = {
  changeRequest: {
    number: 42,
    title: 'Add Redis caching',
    description: 'Adds Redis',
    repository: 'org/app',
    author: { login: 'dev' },
    base: { ref: 'main', sha: 'base123' },
    head: { ref: 'feature/redis', sha: 'head456' },
    stats: { commits: 1, additions: 50, deletions: 5, files_changed: 3 },
    commits: [{ sha: 'head456', message: 'Add Redis caching', author: 'dev' }],
  },
  component: { id: 'comp.api', name: 'API Service', type: 'service', tags: [] },
  dependencies: { dependencies: [], summary: 'none' },
  architectural: { dependencies: [], dependents: [], relationships: [] },
};

const strictModeResult = {
  hasViolations: true,
  violations: [
    {
      severity: 'medium',
      description: 'Undeclared Redis dependency',
      file: 'src/cache.ts',
      line: null,
      suggestion: null,
      commit: null,
    },
  ],
  improvements: null,
  warnings: null,
  modelUpdates: null,
  summary: 'Found undeclared Redis dependency',
};

function jsonResponse(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return { status: 'completed', incomplete_details: null, output_text: text, output: [] };
}

interface OpenAIRequest {
  input: string;
  text?: {
    format: { type: string; name: string; strict: boolean; schema: Record<string, unknown> };
  };
}

function requestAt(index: number): OpenAIRequest {
  return mockCreate.mock.calls[index]?.[0] as OpenAIRequest;
}

describe('OpenAIProvider structured output', () => {
  const provider = new OpenAIProvider({ apiKey: 'test-api-key' });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('sends a strict json_schema format and accepts null optionals', async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse(strictModeResult));

    const result = await provider.analyzeDrift(driftData);

    expect(result.violations[0]?.suggestion).toBeUndefined();
    expect(result.modelUpdates).toBeUndefined();
    const format = requestAt(0).text?.format;
    expect(format).toMatchObject({ type: 'json_schema', name: 'drift_analysis', strict: true });
    const schema = format?.schema ?? {};
    expect(schema['additionalProperties']).toBe(false);
    expect(schema['required']).toEqual(Object.keys(schema['properties'] as object));
  });

  it('sends one repair request after a bad enum value, then succeeds', async () => {
    const badSeverity = {
      ...strictModeResult,
      violations: [{ ...strictModeResult.violations[0], severity: 'critical' }],
    };
    mockCreate
      .mockResolvedValueOnce(jsonResponse(badSeverity))
      .mockResolvedValueOnce(jsonResponse(strictModeResult));

    const result = await provider.analyzeDrift(driftData);

    expect(result.violations).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(requestAt(1).input).toContain('violations.0.severity');
  });

  it('raises PROVIDER_INVALID_RESPONSE when the repair also fails', async () => {
    mockCreate
      .mockResolvedValueOnce(jsonResponse('not json'))
      .mockResolvedValueOnce(jsonResponse({ summary: 'missing fields' }));

    const error = await provider.analyzeDrift(driftData).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErodeError);
    expect((error as ErodeError).code).toBe(ErrorCode.PROVIDER_INVALID_RESPONSE);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('treats a structured-output refusal as a safety block without repair', async () => {
    mockCreate.mockResolvedValueOnce({
      status: 'completed',
      incomplete_details: null,
      output_text: '',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }],
    });

    const error = await provider.analyzeDrift(driftData).catch((e: unknown) => e);

    expect((error as ErodeError).code).toBe(ErrorCode.PROVIDER_SAFETY_BLOCK);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('leaves model patching as free text', async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse('model {\n}\n'));

    await provider.patchModel('model {\n}\n', ['  a -> b'], 'likec4');

    expect(requestAt(0).text).toBeUndefined();
  });
});
