import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ErrorCode, ApiError } from '../../../errors.js';

// Mock openai
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = { create: mockCreate };
    },
  };
});

// Must import after mock setup
import { OpenAIProvider } from '../provider.js';
import type {
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
} from '../../../analysis/analysis-types.js';

function makeStage1Data(componentIds: string[]): ComponentSelectionPromptData {
  return {
    components: componentIds.map((id) => ({
      id,
      name: `Component ${id}`,
      type: 'service',
      tags: [],
    })),
    files: [{ filename: 'src/index.ts' }],
  };
}

function makePreprocessingData() {
  return {
    diff: 'diff --git a/src/index.ts b/src/index.ts\n+import redis',
    commit: { sha: 'abc123', message: 'Add redis', author: 'dev' },
    repository: { owner: 'org', repo: 'app', url: 'https://github.com/org/app' },
    components: [{ id: 'comp.api', name: 'API Service', type: 'service' }],
  };
}

function makePrAnalysisData(): DriftAnalysisPromptData {
  return {
    changeRequest: {
      number: 42,
      title: 'Add Redis caching',
      description: 'Adds Redis as a caching layer',
      repository: 'org/app',
      author: { login: 'dev', name: 'Dev' },
      base: { ref: 'main', sha: 'base123' },
      head: { ref: 'feature/redis', sha: 'head456' },
      stats: { commits: 1, additions: 50, deletions: 5, files_changed: 3 },
      commits: [{ sha: 'head456', message: 'Add Redis caching', author: 'dev' }],
    },
    component: {
      id: 'comp.api',
      name: 'API Service',
      type: 'service',
      tags: [],
    },
    dependencies: {
      dependencies: [
        {
          type: 'added',
          file: 'src/cache.ts',
          dependency: 'redis',
          description: 'Added Redis dependency',
          code: 'import redis',
        },
      ],
      summary: 'Added Redis dependency',
    },
    architectural: {
      dependencies: [],
      dependents: [],
      relationships: [],
    },
  };
}

function makeOpenAIResponse(content: string) {
  return {
    status: 'completed',
    incomplete_details: null,
    output_text: content,
    output: [],
  };
}

function makeOpenAIMessageResponse(content: string) {
  return {
    status: 'completed',
    incomplete_details: null,
    output_text: '',
    output: [
      {
        type: 'reasoning',
        content: [{ type: 'output_text', text: 'ignore me' }],
      },
      {
        type: 'message',
        content: [{ type: 'output_text', text: content }],
      },
    ],
  };
}

function makeIncompleteOpenAIResponse(reason: 'max_output_tokens' | 'content_filter') {
  return {
    status: 'incomplete',
    incomplete_details: { reason },
    output_text: '',
    output: [],
  };
}

function createProvider(): OpenAIProvider {
  return new OpenAIProvider({ apiKey: 'test-api-key' });
}

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw on missing API key', () => {
      expect(() => new OpenAIProvider({ apiKey: '' })).toThrow(ErodeError);
    });
  });

  describe('selectComponent', () => {
    it('should return matching component ID from response', async () => {
      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse('Based on the files, the component is comp.backend')
      );

      const provider = createProvider();
      const result = await provider.selectComponent(
        makeStage1Data(['comp.frontend', 'comp.backend'])
      );
      expect(result).toBe('comp.backend');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5-mini',
          max_output_tokens: 1500,
          reasoning: { effort: 'minimal' },
        })
      );
    });

    it('should return null when no component matches', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse('I cannot determine the component'));

      const provider = createProvider();
      const result = await provider.selectComponent(
        makeStage1Data(['comp.frontend', 'comp.backend'])
      );
      expect(result).toBeNull();
    });

    it('should throw on empty response', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse(''));

      const provider = createProvider();
      await expect(provider.selectComponent(makeStage1Data(['comp.frontend']))).rejects.toThrow(
        ErodeError
      );
    });
  });

  describe('extractDependencies', () => {
    it('should parse valid JSON response', async () => {
      const responseJson = {
        dependencies: [
          {
            type: 'added',
            file: 'src/cache.ts',
            dependency: 'redis',
            description: 'Added Redis',
            code: 'import redis',
          },
        ],
        summary: 'Added Redis dependency',
      };

      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse('```json\n' + JSON.stringify(responseJson) + '\n```')
      );

      const provider = createProvider();
      const result = await provider.extractDependencies(makePreprocessingData());
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]?.dependency).toBe('redis');
      expect(result.summary).toBe('Added Redis dependency');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5-mini',
          max_output_tokens: 1500,
          reasoning: { effort: 'minimal' },
        })
      );
    });

    it('should throw on non-JSON response', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse('This is not JSON at all'));

      const provider = createProvider();
      await expect(provider.extractDependencies(makePreprocessingData())).rejects.toThrow(
        ErodeError
      );
    });
  });

  describe('analyzeDrift', () => {
    it('should return enriched analysis result', async () => {
      const analysisJson = {
        hasViolations: true,
        violations: [
          {
            severity: 'medium',
            description: 'Undeclared dependency on Redis',
            file: 'src/cache.ts',
            line: 1,
            commit: 'head456',
          },
        ],
        summary: 'Found undeclared Redis dependency',
      };

      mockCreate.mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(analysisJson)));

      const provider = createProvider();
      const data = makePrAnalysisData();
      const result = await provider.analyzeDrift(data);

      expect(result.hasViolations).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.metadata).toBe(data.changeRequest);
      expect(result.component).toBe(data.component);
      expect(result.dependencyChanges).toBe(data.dependencies);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5',
          max_output_tokens: 6000,
          reasoning: { effort: 'minimal' },
        })
      );
    });
  });

  describe('safety filter handling', () => {
    it('should throw PROVIDER_SAFETY_BLOCK on content_filter', async () => {
      mockCreate.mockResolvedValueOnce(makeIncompleteOpenAIResponse('content_filter'));

      const provider = createProvider();
      try {
        await provider.selectComponent(makeStage1Data(['comp.api']));
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ErodeError);
        expect((error as ErodeError).code).toBe(ErrorCode.PROVIDER_SAFETY_BLOCK);
      }
    });
  });

  describe('truncation handling', () => {
    it('should throw PROVIDER_INVALID_RESPONSE on max_output_tokens', async () => {
      mockCreate.mockResolvedValueOnce(makeIncompleteOpenAIResponse('max_output_tokens'));

      const provider = createProvider();
      try {
        await provider.selectComponent(makeStage1Data(['comp.api']));
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ErodeError);
        const erodeError = error as ErodeError;
        expect(erodeError.code).toBe(ErrorCode.PROVIDER_INVALID_RESPONSE);
        expect(erodeError.userMessage).toContain('output budget');
      }
    });
  });

  describe('response text extraction', () => {
    it('should read fallback output text from message items only', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIMessageResponse('comp.api'));

      const provider = createProvider();
      const result = await provider.selectComponent(makeStage1Data(['comp.api']));

      expect(result).toBe('comp.api');
    });

    it('should throw on empty output after fallback', async () => {
      mockCreate.mockResolvedValueOnce(makeOpenAIMessageResponse(''));

      const provider = createProvider();
      await expect(provider.selectComponent(makeStage1Data(['comp.api']))).rejects.toThrow(
        ErodeError
      );
    });
  });

  describe('retry on rate limit', () => {
    it('should retry on 429 and eventually succeed', async () => {
      const rateLimitError = new ApiError('Rate limited', 429);
      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(makeOpenAIResponse('comp.api'));

      const provider = createProvider();
      const result = await provider.selectComponent(makeStage1Data(['comp.api']));
      expect(result).toBe('comp.api');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-recoverable errors', async () => {
      const nonRecoverableError = new ErodeError(
        'Invalid input',
        ErrorCode.INPUT_INVALID,
        'Bad input',
        {},
        false
      );
      mockCreate.mockRejectedValueOnce(nonRecoverableError);

      const provider = createProvider();
      await expect(provider.selectComponent(makeStage1Data(['comp.api']))).rejects.toThrow(
        ErodeError
      );
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should convert SDK errors via fromOpenAIError', async () => {
      const sdkError = Object.assign(new Error('Connection failed'), {
        status: 500,
        name: 'APIError',
      });
      mockCreate.mockRejectedValueOnce(sdkError);

      const provider = createProvider();
      try {
        await provider.selectComponent(makeStage1Data(['comp.api']));
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
      }
    });

    it('should read status from OpenAI rate limit error', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        status: 429,
        name: 'RateLimitError',
      });
      // Reject all 3 attempts to exhaust retries
      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError);

      const provider = createProvider();
      try {
        await provider.selectComponent(makeStage1Data(['comp.api']));
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(429);
        expect((error as ApiError).isRateLimited).toBe(true);
      }
    });
  });

  describe('patchModel', () => {
    it('should use fast model for patching', async () => {
      const patchedContent = 'model {\n  comp.a -> comp.b\n}\n';
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse(patchedContent));

      const provider = createProvider();
      await provider.patchModel('model {\n}\n', ['  comp.a -> comp.b'], 'likec4');

      expect(mockCreate).toHaveBeenCalled();
      const callArg = mockCreate.mock.calls[0]?.[0] as
        | { max_output_tokens?: number; model?: string; reasoning?: { effort?: string } }
        | undefined;
      expect(callArg?.model).toBe('gpt-5-mini');
      expect(callArg?.max_output_tokens).toBe(6000);
      expect(callArg?.reasoning?.effort).toBe('medium');
    });

    it('should increase the output budget for large model files', async () => {
      const patchedContent = 'model {\n  comp.a -> comp.b\n}\n';
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse(patchedContent));

      const provider = createProvider();
      await provider.patchModel('x'.repeat(40_000), ['  comp.a -> comp.b'], 'likec4');

      const callArg = mockCreate.mock.calls[0]?.[0] as { max_output_tokens?: number } | undefined;
      expect(callArg?.max_output_tokens).toBeGreaterThan(6000);
    });

    it('should return patched content', async () => {
      const patchedContent = 'model {\n  comp.a -> comp.b\n}\n';
      mockCreate.mockResolvedValueOnce(makeOpenAIResponse(patchedContent));

      const provider = createProvider();
      const result = await provider.patchModel('model {\n}\n', ['  comp.a -> comp.b'], 'likec4');

      expect(result).toBe(patchedContent);
    });

    it('should retry on rate limit', async () => {
      const patchedContent = 'model {\n  comp.a -> comp.b\n}\n';
      const rateLimitError = new ApiError('Rate limited', 429);
      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(makeOpenAIResponse(patchedContent));

      const provider = createProvider();
      const result = await provider.patchModel('model {\n}\n', ['  comp.a -> comp.b'], 'likec4');

      expect(result).toBe(patchedContent);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });
});
