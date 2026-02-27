import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ErrorCode, ApiError } from '../../../errors.js';

// Mock @anthropic-ai/sdk
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// Must import after mock setup
import { AnthropicProvider } from '../provider.js';
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

function makeAnthropicResponse(
  text: string,
  stopReason = 'end_turn',
  inputTokens = 100,
  outputTokens = 20
) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function createProvider(): AnthropicProvider {
  return new AnthropicProvider({ apiKey: 'test-api-key' });
}

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw on missing API key', () => {
      expect(() => new AnthropicProvider({ apiKey: '' })).toThrow(ErodeError);
    });

    it('should create provider with valid API key', () => {
      const provider = createProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('selectComponent', () => {
    it('should return matching component ID from response', async () => {
      mockCreate.mockResolvedValueOnce(
        makeAnthropicResponse('Based on the files, the component is comp.backend')
      );

      const provider = createProvider();
      const result = await provider.selectComponent(
        makeStage1Data(['comp.frontend', 'comp.backend'])
      );
      expect(result).toBe('comp.backend');
    });

    it('should return null when no component matches', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse('I cannot determine the component'));

      const provider = createProvider();
      const result = await provider.selectComponent(
        makeStage1Data(['comp.frontend', 'comp.backend'])
      );
      expect(result).toBeNull();
    });

    it('should throw on empty response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 0 },
      });

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
        makeAnthropicResponse('```json\n' + JSON.stringify(responseJson) + '\n```')
      );

      const provider = createProvider();
      const result = await provider.extractDependencies(makePreprocessingData());
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]?.dependency).toBe('redis');
      expect(result.summary).toBe('Added Redis dependency');
    });

    it('should throw on non-JSON response', async () => {
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse('This is not JSON at all'));

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

      mockCreate.mockResolvedValueOnce(
        makeAnthropicResponse(JSON.stringify(analysisJson), 'end_turn', 1000, 200)
      );

      const provider = createProvider();
      const data = makePrAnalysisData();
      const result = await provider.analyzeDrift(data);

      expect(result.hasViolations).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.metadata).toBe(data.changeRequest);
      expect(result.component).toBe(data.component);
      expect(result.dependencyChanges).toBe(data.dependencies);
    });
  });

  describe('generateArchitectureCode', () => {
    it('should return generated code text', async () => {
      const analysisJson = {
        hasViolations: false,
        violations: [],
        summary: 'No violations',
      };

      mockCreate.mockResolvedValueOnce(
        makeAnthropicResponse(JSON.stringify(analysisJson), 'end_turn', 1000, 200)
      );

      // First call for analyzeDrift to get a result
      const provider = createProvider();
      const data = makePrAnalysisData();
      const analysisResult = await provider.analyzeDrift(data);

      const likec4Code = 'specification { element component }';
      mockCreate.mockResolvedValueOnce(makeAnthropicResponse(likec4Code));

      const result = await provider.generateArchitectureCode(analysisResult);
      expect(result).toBe(likec4Code);
    });
  });

  describe('safety filter handling', () => {
    it('should throw PROVIDER_SAFETY_BLOCK on refusal', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [],
        stop_reason: 'refusal',
        usage: { input_tokens: 100, output_tokens: 0 },
      });

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

  describe('retry on rate limit', () => {
    it('should retry on 429 and eventually succeed', async () => {
      const rateLimitError = new ApiError('Rate limited', 429);
      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(makeAnthropicResponse('comp.api', 'end_turn', 100, 10));

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
    it('should convert SDK errors via fromAnthropicError', async () => {
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

    it('should read status from Anthropic RateLimitError', async () => {
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
});
