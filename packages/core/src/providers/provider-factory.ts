import type { AIProvider } from './ai-provider.js';
import { GeminiProvider } from './gemini/provider.js';
import { AnthropicProvider } from './anthropic/provider.js';
import { OpenAIProvider } from './openai/provider.js';
import { CONFIG } from '../utils/config.js';
import { ErodeError, ErrorCode } from '../errors.js';

export function createAIProvider(): AIProvider {
  const provider = CONFIG.ai.provider;

  switch (provider) {
    case 'gemini': {
      if (!CONFIG.gemini.apiKey) {
        throw new ErodeError(
          'A Gemini API key is needed',
          ErrorCode.AUTH_KEY_MISSING,
          'No Gemini API key found. Set GEMINI_API_KEY in your environment or .env file.'
        );
      }
      return new GeminiProvider({
        apiKey: CONFIG.gemini.apiKey,
        fastModel: CONFIG.gemini.fastModel,
        advancedModel: CONFIG.gemini.advancedModel,
      });
    }
    case 'openai': {
      if (!CONFIG.openai.apiKey) {
        throw new ErodeError(
          'An OpenAI API key is needed',
          ErrorCode.AUTH_KEY_MISSING,
          'No OpenAI API key found. Set OPENAI_API_KEY in your environment or .env file.'
        );
      }
      return new OpenAIProvider({
        apiKey: CONFIG.openai.apiKey,
        fastModel: CONFIG.openai.fastModel,
        advancedModel: CONFIG.openai.advancedModel,
      });
    }
    case 'anthropic': {
      if (!CONFIG.anthropic.apiKey) {
        throw new ErodeError(
          'An Anthropic API key is needed',
          ErrorCode.AUTH_KEY_MISSING,
          'No Anthropic API key found. Set ANTHROPIC_API_KEY in your environment or .env file.'
        );
      }
      return new AnthropicProvider({
        apiKey: CONFIG.anthropic.apiKey,
        fastModel: CONFIG.anthropic.fastModel,
        advancedModel: CONFIG.anthropic.advancedModel,
      });
    }
    default: {
      const _exhaustive: never = provider;
      throw new ErodeError(
        `Unsupported AI provider: ${String(_exhaustive)}`,
        ErrorCode.CONFIG_INVALID,
        `Unsupported AI provider. Supported providers: gemini, anthropic, openai.`
      );
    }
  }
}
