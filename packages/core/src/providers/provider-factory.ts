import type { AIProvider } from './ai-provider.js';
import { GeminiProvider } from './gemini/provider.js';
import { AnthropicProvider } from './anthropic/provider.js';
import { CONFIG } from '../utils/config.js';
import { ErodeError, ErrorCode } from '../errors.js';

export function createAIProvider(): AIProvider {
  const provider = CONFIG.ai.provider;

  if (provider === 'gemini') {
    if (!CONFIG.gemini.apiKey) {
      throw new ErodeError(
        'Gemini API key is required',
        ErrorCode.MISSING_API_KEY,
        'Missing Gemini API key. Set GEMINI_API_KEY in your environment or .env file.'
      );
    }
    return new GeminiProvider({
      apiKey: CONFIG.gemini.apiKey,
      fastModel: CONFIG.gemini.fastModel,
      advancedModel: CONFIG.gemini.advancedModel,
    });
  }

  if (!CONFIG.anthropic.apiKey) {
    throw new ErodeError(
      'Anthropic API key is required',
      ErrorCode.MISSING_API_KEY,
      'Missing Anthropic API key. Set ANTHROPIC_API_KEY in your environment or .env file.'
    );
  }
  return new AnthropicProvider({
    apiKey: CONFIG.anthropic.apiKey,
    fastModel: CONFIG.anthropic.fastModel,
    advancedModel: CONFIG.anthropic.advancedModel,
  });
}
