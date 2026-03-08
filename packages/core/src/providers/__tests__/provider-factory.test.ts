import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErodeError, ErrorCode } from '../../errors.js';

const {
  mockGeminiInstance,
  mockOpenAIInstance,
  mockAnthropicInstance,
  MockGeminiProvider,
  MockOpenAIProvider,
  MockAnthropicProvider,
  mockConfig,
} = vi.hoisted(() => {
  const geminiInstance = { type: 'gemini' };
  const openaiInstance = { type: 'openai' };
  const anthropicInstance = { type: 'anthropic' };
  return {
    mockGeminiInstance: geminiInstance,
    mockOpenAIInstance: openaiInstance,
    mockAnthropicInstance: anthropicInstance,
    MockGeminiProvider: vi.fn(function () {
      return geminiInstance;
    }),
    MockOpenAIProvider: vi.fn(function () {
      return openaiInstance;
    }),
    MockAnthropicProvider: vi.fn(function () {
      return anthropicInstance;
    }),
    mockConfig: {
      ai: { provider: 'gemini' as 'gemini' | 'openai' | 'anthropic' },
      gemini: {
        apiKey: 'test-gemini-key' as string | undefined,
        fastModel: 'gemini-flash',
        advancedModel: 'gemini-pro',
      },
      openai: {
        apiKey: 'test-openai-key' as string | undefined,
        fastModel: 'gpt-4.1-mini',
        advancedModel: 'gpt-4.1',
      },
      anthropic: {
        apiKey: 'test-anthropic-key' as string | undefined,
        fastModel: 'claude-haiku',
        advancedModel: 'claude-sonnet',
      },
    },
  };
});

vi.mock('../gemini/provider.js', () => ({
  GeminiProvider: MockGeminiProvider,
}));
vi.mock('../openai/provider.js', () => ({
  OpenAIProvider: MockOpenAIProvider,
}));
vi.mock('../anthropic/provider.js', () => ({
  AnthropicProvider: MockAnthropicProvider,
}));
vi.mock('../../utils/config.js', () => ({
  CONFIG: mockConfig,
  ENV_VAR_NAMES: {
    geminiApiKey: 'ERODE_GEMINI_API_KEY',
    openaiApiKey: 'ERODE_OPENAI_API_KEY',
    anthropicApiKey: 'ERODE_ANTHROPIC_API_KEY',
  },
  RC_FILENAME: '.eroderc.json',
}));

import { createAIProvider } from '../provider-factory.js';
import { GeminiProvider } from '../gemini/provider.js';
import { OpenAIProvider } from '../openai/provider.js';
import { AnthropicProvider } from '../anthropic/provider.js';

describe('createAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.ai.provider = 'gemini';
    mockConfig.gemini.apiKey = 'test-gemini-key';
    mockConfig.gemini.fastModel = 'gemini-flash';
    mockConfig.gemini.advancedModel = 'gemini-pro';
    mockConfig.openai.apiKey = 'test-openai-key';
    mockConfig.openai.fastModel = 'gpt-4.1-mini';
    mockConfig.openai.advancedModel = 'gpt-4.1';
    mockConfig.anthropic.apiKey = 'test-anthropic-key';
    mockConfig.anthropic.fastModel = 'claude-haiku';
    mockConfig.anthropic.advancedModel = 'claude-sonnet';
  });

  it('should return GeminiProvider when provider is gemini and key is set', () => {
    mockConfig.ai.provider = 'gemini';

    const result = createAIProvider();

    expect(result).toBe(mockGeminiInstance);
    expect(GeminiProvider).toHaveBeenCalledWith({
      apiKey: 'test-gemini-key',
      fastModel: 'gemini-flash',
      advancedModel: 'gemini-pro',
    });
  });

  it('should return OpenAIProvider when provider is openai and key is set', () => {
    mockConfig.ai.provider = 'openai';

    const result = createAIProvider();

    expect(result).toBe(mockOpenAIInstance);
    expect(OpenAIProvider).toHaveBeenCalledWith({
      apiKey: 'test-openai-key',
      fastModel: 'gpt-4.1-mini',
      advancedModel: 'gpt-4.1',
    });
  });

  it('should return AnthropicProvider when provider is anthropic and key is set', () => {
    mockConfig.ai.provider = 'anthropic';

    const result = createAIProvider();

    expect(result).toBe(mockAnthropicInstance);
    expect(AnthropicProvider).toHaveBeenCalledWith({
      apiKey: 'test-anthropic-key',
      fastModel: 'claude-haiku',
      advancedModel: 'claude-sonnet',
    });
  });

  it('should throw AUTH_KEY_MISSING when gemini API key is missing', () => {
    mockConfig.ai.provider = 'gemini';
    mockConfig.gemini.apiKey = undefined;

    expect(() => createAIProvider()).toThrow(ErodeError);
    try {
      createAIProvider();
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      expect((error as ErodeError).code).toBe(ErrorCode.AUTH_KEY_MISSING);
    }
  });

  it('should throw AUTH_KEY_MISSING when openai API key is missing', () => {
    mockConfig.ai.provider = 'openai';
    mockConfig.openai.apiKey = undefined;

    expect(() => createAIProvider()).toThrow(ErodeError);
    try {
      createAIProvider();
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      expect((error as ErodeError).code).toBe(ErrorCode.AUTH_KEY_MISSING);
    }
  });

  it('should throw AUTH_KEY_MISSING when anthropic API key is missing', () => {
    mockConfig.ai.provider = 'anthropic';
    mockConfig.anthropic.apiKey = undefined;

    expect(() => createAIProvider()).toThrow(ErodeError);
    try {
      createAIProvider();
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      expect((error as ErodeError).code).toBe(ErrorCode.AUTH_KEY_MISSING);
    }
  });

  it('should pass fastModel and advancedModel to provider constructors', () => {
    mockConfig.ai.provider = 'gemini';
    mockConfig.gemini.fastModel = 'custom-fast';
    mockConfig.gemini.advancedModel = 'custom-advanced';

    createAIProvider();

    expect(GeminiProvider).toHaveBeenCalledWith({
      apiKey: 'test-gemini-key',
      fastModel: 'custom-fast',
      advancedModel: 'custom-advanced',
    });
  });
});
