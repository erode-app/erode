import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ErrorCode } from '../../../errors.js';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { AnthropicProvider } from '../provider.js';
import type { DriftAnalysisPromptData } from '../../../analysis/analysis-types.js';

const dependencyData = {
  diff: 'diff --git a/src/index.ts b/src/index.ts\n+import redis',
  commit: { sha: 'abc123', message: 'Add redis', author: 'dev' },
  repository: { owner: 'org', repo: 'app', url: 'https://github.com/org/app' },
  components: [{ id: 'comp.api', name: 'API Service', type: 'service' }],
};

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

const validResult = {
  dependencies: [
    {
      type: 'added',
      file: 'src/cache.ts',
      dependency: 'redis',
      description: 'Cache store',
      code: 'import redis',
    },
  ],
  summary: 'Added Redis',
};

const invalidResult = {
  dependencies: [{ ...validResult.dependencies[0], type: 'introduced' }],
  summary: 'Added Redis',
};

function jsonResponse(value: unknown, stopReason = 'end_turn') {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return {
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

type Schema = Record<string, unknown>;

interface AnthropicRequest {
  messages: { content: string }[];
  tools?: unknown;
  tool_choice?: unknown;
  output_config?: { format: { type: string; schema: Schema } };
}

function requestAt(index: number): AnthropicRequest {
  return mockCreate.mock.calls[index]?.[0] as AnthropicRequest;
}

/** Count parameters against the documented structured-output complexity limits. */
function countParameters(schema: Schema, counts = { optional: 0, union: 0 }) {
  const properties = (schema['properties'] ?? {}) as Record<string, Schema>;
  const required = new Set((schema['required'] ?? []) as string[]);
  for (const [name, child] of Object.entries(properties)) {
    if (!required.has(name)) counts.optional++;
    if (Array.isArray(child['type']) || Array.isArray(child['anyOf'])) counts.union++;
    countParameters(child, counts);
  }
  const items = schema['items'] as Schema | undefined;
  if (items) countParameters(items, counts);
  for (const variant of (schema['anyOf'] ?? []) as Schema[]) countParameters(variant, counts);
  return counts;
}

describe('AnthropicProvider structured output', () => {
  const provider = new AnthropicProvider({ apiKey: 'test-api-key' });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('sends output_config json_schema and no tools', async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse(validResult));

    const result = await provider.extractDependencies(dependencyData);

    expect(result).toEqual(validResult);
    const request = requestAt(0);
    expect(request.tools).toBeUndefined();
    expect(request.tool_choice).toBeUndefined();
    expect(request.output_config?.format.type).toBe('json_schema');
    expect(request.output_config?.format.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['dependencies', 'summary'],
    });
  });

  it('keeps the drift and dependency schemas within the complexity limits', async () => {
    mockCreate
      .mockResolvedValueOnce(jsonResponse(validResult))
      .mockResolvedValueOnce(jsonResponse({ hasViolations: false, violations: [], summary: 'ok' }));

    await provider.extractDependencies(dependencyData);
    await provider.analyzeDrift(driftData);

    for (const index of [0, 1]) {
      const schema = requestAt(index).output_config?.format.schema ?? {};
      const counts = countParameters(schema);
      expect(counts.optional).toBeLessThanOrEqual(24);
      expect(counts.union).toBeLessThanOrEqual(16);
    }
    expect(
      countParameters(requestAt(1).output_config?.format.schema ?? {}).optional
    ).toBeGreaterThan(0);
  });

  it('sends one repair request with the validation issues, then succeeds', async () => {
    mockCreate
      .mockResolvedValueOnce(jsonResponse(invalidResult))
      .mockResolvedValueOnce(jsonResponse(validResult));

    const result = await provider.extractDependencies(dependencyData);

    expect(result).toEqual(validResult);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const repairPrompt = requestAt(1).messages[0]?.content ?? '';
    expect(repairPrompt.startsWith(requestAt(0).messages[0]?.content ?? '')).toBe(true);
    expect(repairPrompt).toContain('failed validation');
    expect(repairPrompt).toContain('dependencies.0.type');
    expect(repairPrompt).toContain('"type":"introduced"');
  });

  it('raises PROVIDER_INVALID_RESPONSE when the repair also fails', async () => {
    mockCreate
      .mockResolvedValueOnce(jsonResponse('not json'))
      .mockResolvedValueOnce(jsonResponse({ summary: 'still wrong' }));

    const error = await provider.extractDependencies(dependencyData).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErodeError);
    expect((error as ErodeError).code).toBe(ErrorCode.PROVIDER_INVALID_RESPONSE);
    expect((error as ErodeError).message).toContain('dependencies');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('does not repair a truncated response', async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse('{"dependencies": [', 'max_tokens'));

    const error = await provider.extractDependencies(dependencyData).catch((e: unknown) => e);

    expect((error as ErodeError).userMessage).toContain('output budget');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('maps a refusal to a safety block without repair', async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse('', 'refusal'));

    const error = await provider.extractDependencies(dependencyData).catch((e: unknown) => e);

    expect((error as ErodeError).code).toBe(ErrorCode.PROVIDER_SAFETY_BLOCK);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('constrains component selection to the candidate ids', async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse({ componentId: 'b' }));

    const result = await provider.selectComponent({
      components: ['a', 'b'].map((id) => ({ id, name: id, type: 'service', tags: [] })),
      files: [{ filename: 'b/index.ts' }],
    });

    expect(result).toBe('b');
    expect(requestAt(0).output_config?.format.schema).toMatchObject({
      properties: { componentId: { enum: ['a', 'b'] } },
      required: ['componentId'],
    });
  });

  it('truncates a long invalid response in the repair prompt', async () => {
    const huge = JSON.stringify({ dependencies: 'x'.repeat(10_000), summary: 's' });
    mockCreate
      .mockResolvedValueOnce(jsonResponse(huge))
      .mockResolvedValueOnce(jsonResponse(validResult));

    await provider.extractDependencies(dependencyData);

    const repairPrompt = requestAt(1).messages[0]?.content ?? '';
    expect(repairPrompt).toContain('(truncated)');
    expect(repairPrompt.length).toBeLessThan(
      (requestAt(0).messages[0]?.content.length ?? 0) + 6000
    );
  });

  const components = (ids: string[]) =>
    ids.map((id) => ({ id, name: id, type: 'service', tags: [] }));
  const selectionData = (ids: string[]) => ({
    components: components(ids),
    files: [{ filename: 'a/index.ts' }],
  });

  it('returns null when the provider rejects the selection request as invalid (400)', async () => {
    mockCreate.mockRejectedValueOnce(
      Object.assign(new Error('schema unsupported'), { status: 400 })
    );

    await expect(provider.selectComponent(selectionData(['a', 'b']))).resolves.toBeNull();
  });

  it.each([401, 403, 429])('still propagates a %i from selectComponent', async (status) => {
    mockCreate.mockRejectedValue(Object.assign(new Error('nope'), { status }));

    await expect(provider.selectComponent(selectionData(['a', 'b']))).rejects.toThrow('nope');
  });

  it('still propagates a 400 from the analysis stages', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('bad schema'), { status: 400 }));

    await expect(provider.extractDependencies(dependencyData)).rejects.toThrow('bad schema');
  });

  it('uses a plain string schema above 100 components and checks membership in code', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `c${String(i)}`);
    mockCreate
      .mockResolvedValueOnce(jsonResponse({ componentId: 'c7' }))
      .mockResolvedValueOnce(jsonResponse({ componentId: 'unknown' }));

    await expect(provider.selectComponent(selectionData(ids))).resolves.toBe('c7');
    const schema = requestAt(0).output_config?.format.schema as {
      properties: { componentId: Schema };
    };
    expect(schema.properties.componentId).toEqual({ type: 'string' });
    await expect(provider.selectComponent(selectionData(ids))).resolves.toBeNull();
  });

  it('leaves model patching as free text', async () => {
    mockCreate.mockResolvedValueOnce(jsonResponse('model {\n}\n'));

    await provider.patchModel('model {\n}\n', ['  a -> b'], 'likec4');

    expect(requestAt(0).output_config).toBeUndefined();
  });
});
