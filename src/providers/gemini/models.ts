export type GeminiModelId = 'gemini-2.0-flash' | 'gemini-2.5-pro';

export const GEMINI_MODELS = {
  FLASH: 'gemini-2.0-flash',
  PRO: 'gemini-2.5-pro',
} as const satisfies Record<string, GeminiModelId>;