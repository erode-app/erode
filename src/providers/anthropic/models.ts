export type AnthropicModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-5-20250929';

export const ANTHROPIC_MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-5-20250929',
} as const satisfies Record<string, AnthropicModelId>;