import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ErrorCode } from '../../../errors.js';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = { generateContent: mockGenerateContent };
    },
    FinishReason: { STOP: 'STOP', MAX_TOKENS: 'MAX_TOKENS', SAFETY: 'SAFETY' },
    ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  };
});

import { GeminiProvider } from '../provider.js';

const dependencyData = {
  diff: 'diff --git a/src/index.ts b/src/index.ts\n+import redis',
  commit: { sha: 'abc123', message: 'Add redis', author: 'dev' },
  repository: { owner: 'org', repo: 'app', url: 'https://github.com/org/app' },
  components: [{ id: 'comp.api', name: 'API Service', type: 'service' }],
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

function textResponse(text: string, finishReason = 'STOP') {
  return { text, candidates: [{ finishReason }] };
}

interface GeminiRequest {
  contents: string;
  config: { responseMimeType?: string; responseJsonSchema?: Record<string, unknown> };
}

function requestAt(index: number): GeminiRequest {
  return mockGenerateContent.mock.calls[index]?.[0] as GeminiRequest;
}

describe('GeminiProvider structured output', () => {
  const provider = new GeminiProvider({ apiKey: 'test-api-key' });

  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it('requests JSON constrained by the stage schema', async () => {
    mockGenerateContent.mockResolvedValueOnce(textResponse(JSON.stringify(validResult)));

    const result = await provider.extractDependencies(dependencyData);

    expect(result).toEqual(validResult);
    const { config } = requestAt(0);
    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseJsonSchema).toMatchObject({
      type: 'object',
      required: ['dependencies', 'summary'],
    });
  });

  it('sends one repair request after malformed JSON, then succeeds', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(textResponse('{"dependencies": [], "summary": "x",}'))
      .mockResolvedValueOnce(textResponse(JSON.stringify(validResult)));

    const result = await provider.extractDependencies(dependencyData);

    expect(result).toEqual(validResult);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(requestAt(1).contents).toContain('not valid JSON');
  });

  it('raises PROVIDER_INVALID_RESPONSE when the repair also fails', async () => {
    const badEnum = JSON.stringify({
      dependencies: [{ ...validResult.dependencies[0], type: 'critical' }],
      summary: 'x',
    });
    mockGenerateContent
      .mockResolvedValueOnce(textResponse(badEnum))
      .mockResolvedValueOnce(textResponse(badEnum));

    const error = await provider.extractDependencies(dependencyData).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErodeError);
    expect((error as ErodeError).code).toBe(ErrorCode.PROVIDER_INVALID_RESPONSE);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('does not repair a response cut short by the token limit', async () => {
    mockGenerateContent.mockResolvedValueOnce(textResponse('{"dependencies": [', 'MAX_TOKENS'));

    const error = await provider.extractDependencies(dependencyData).catch((e: unknown) => e);

    expect((error as ErodeError).userMessage).toContain('output budget');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('leaves model patching as free text', async () => {
    mockGenerateContent.mockResolvedValueOnce(textResponse('model {\n}\n'));

    await provider.patchModel('model {\n}\n', ['  a -> b'], 'likec4');

    expect(requestAt(0).config.responseMimeType).toBeUndefined();
    expect(requestAt(0).config.responseJsonSchema).toBeUndefined();
  });
});
