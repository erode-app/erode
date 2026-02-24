import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ErrorCode, ApiError } from '../../../errors.js';

// Mock @google/genai
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
    },
    FinishReason: {
      FINISH_REASON_UNSPECIFIED: 'FINISH_REASON_UNSPECIFIED',
      STOP: 'STOP',
      MAX_TOKENS: 'MAX_TOKENS',
      SAFETY: 'SAFETY',
      RECITATION: 'RECITATION',
      LANGUAGE: 'LANGUAGE',
      OTHER: 'OTHER',
      BLOCKLIST: 'BLOCKLIST',
      PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
      SPII: 'SPII',
      MALFORMED_FUNCTION_CALL: 'MALFORMED_FUNCTION_CALL',
    },
  };
});

// Must import after mock setup
import { GeminiProvider } from '../provider.js';
import type { ComponentSelectionPromptData, DriftAnalysisPromptData } from '../../../analysis/analysis-types.js';

function makeStage0Data(componentIds: string[]): ComponentSelectionPromptData {
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

function createProvider(): GeminiProvider {
  return new GeminiProvider({ apiKey: 'test-api-key' });
}

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw on missing API key', () => {
      expect(() => new GeminiProvider({ apiKey: '' })).toThrow(ErodeError);
    });

    it('should create provider with valid API key', () => {
      const provider = createProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('selectComponent', () => {
    it('should return matching component ID from response', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Based on the files, the component is comp.backend',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
      });

      const provider = createProvider();
      const result = await provider.selectComponent(
        makeStage0Data(['comp.frontend', 'comp.backend'])
      );
      expect(result).toBe('comp.backend');
    });

    it('should return null when no component matches', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'I cannot determine the component',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
      });

      const provider = createProvider();
      const result = await provider.selectComponent(
        makeStage0Data(['comp.frontend', 'comp.backend'])
      );
      expect(result).toBeNull();
    });

    it('should return null on empty response', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: undefined,
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 },
      });

      const provider = createProvider();
      // Empty text triggers INVALID_RESPONSE error, but selectComponent
      // calls callGemini which throws. The retry wraps it.
      await expect(provider.selectComponent(makeStage0Data(['comp.frontend']))).rejects.toThrow();
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

      mockGenerateContent.mockResolvedValueOnce({
        text: '```json\n' + JSON.stringify(responseJson) + '\n```',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100 },
      });

      const provider = createProvider();
      const result = await provider.extractDependencies(makePreprocessingData());
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]?.dependency).toBe('redis');
      expect(result.summary).toBe('Added Redis dependency');
    });

    it('should throw on non-JSON response', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'This is not JSON at all',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 50 },
      });

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

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(analysisJson),
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 },
      });

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

  describe('safety filter handling', () => {
    it('should throw SAFETY_FILTERED on safety block', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: undefined,
        candidates: [{ finishReason: 'SAFETY' }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 },
      });

      const provider = createProvider();
      try {
        await provider.selectComponent(makeStage0Data(['comp.api']));
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ErodeError);
        expect((error as ErodeError).code).toBe(ErrorCode.SAFETY_FILTERED);
      }
    });
  });

  describe('retry on rate limit', () => {
    it('should retry on 429 and eventually succeed', async () => {
      const rateLimitError = new ApiError('Rate limited', 429);
      mockGenerateContent.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({
        text: 'comp.api',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
      });

      const provider = createProvider();
      const result = await provider.selectComponent(makeStage0Data(['comp.api']));
      expect(result).toBe('comp.api');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-recoverable errors', async () => {
      const nonRecoverableError = new ErodeError(
        'Invalid input',
        ErrorCode.INVALID_INPUT,
        'Bad input',
        {},
        false
      );
      mockGenerateContent.mockRejectedValueOnce(nonRecoverableError);

      const provider = createProvider();
      await expect(provider.selectComponent(makeStage0Data(['comp.api']))).rejects.toThrow(
        ErodeError
      );
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
  });
});
