import * as dotenv from 'dotenv';
import { z } from 'zod';
import { ConfigurationError } from '../errors.js';
dotenv.config();
const ConfigSchema = z.object({
  ai: z.object({
    provider: z.enum(['gemini', 'anthropic', 'openai']).default('gemini'),
  }),
  constraints: z.object({
    maxFilesPerDiff: z.number().int().min(1).max(1000).default(50),
    maxLinesPerDiff: z.number().int().min(100).max(50000).default(5000),
    maxContextChars: z.number().int().min(1000).max(100000).default(10000),
  }),
  adapter: z.object({
    format: z.string().default('likec4'),
    likec4: z.object({
      excludePaths: z.array(z.string()).default([]),
      excludeTags: z.array(z.string()).default([]),
    }),
  }),
  github: z.object({
    token: z.string().optional(),
    modelRepoPrToken: z.string().optional(),
    defaultTimeout: z.number().int().min(1000).max(300000).default(30000),
    baseUrl: z.url().default('https://api.github.com'),
  }),
  gitlab: z.object({
    token: z.string().optional(),
    baseUrl: z.url().default('https://gitlab.com'),
  }),
  bitbucket: z.object({
    token: z.string().optional(),
    baseUrl: z.url().default('https://api.bitbucket.org/2.0'),
  }),
  anthropic: z.object({
    apiKey: z.string().optional(),
    timeout: z.number().int().min(1000).max(300000).default(60000),
    fastModel: z.string().default('claude-haiku-4-5-20251001'),
    advancedModel: z.string().default('claude-sonnet-4-5-20250929'),
  }),
  gemini: z.object({
    apiKey: z.string().optional(),
    timeout: z.number().int().min(1000).max(300000).default(60000),
    fastModel: z.string().default('gemini-2.5-flash'),
    advancedModel: z.string().default('gemini-2.5-flash'),
  }),
  openai: z.object({
    apiKey: z.string().optional(),
    timeout: z.number().int().min(1000).max(300000).default(60000),
    fastModel: z.string().default('gpt-4.1-mini'),
    advancedModel: z.string().default('gpt-4.1'),
  }),
  debug: z.object({
    enabled: z.boolean().default(false),
    outputDir: z.string().min(1).default('prompts'),
    verbose: z.boolean().default(false),
  }),
  app: z.object({
    name: z.string().default('erode'),
    version: z.string().default('0.1.0'),
  }),
});
type Config = z.infer<typeof ConfigSchema>;
const ENV_MAPPINGS: Record<string, string[]> = {
  AI_PROVIDER: ['ai', 'provider'],
  ANTHROPIC_API_KEY: ['anthropic', 'apiKey'],
  GEMINI_API_KEY: ['gemini', 'apiKey'],
  GEMINI_TIMEOUT: ['gemini', 'timeout'],
  GITHUB_TOKEN: ['github', 'token'],
  MODEL_FORMAT: ['adapter', 'format'],
  LIKEC4_EXCLUDE_PATHS: ['adapter', 'likec4', 'excludePaths'],
  LIKEC4_EXCLUDE_TAGS: ['adapter', 'likec4', 'excludeTags'],
  MODEL_REPO_PR_TOKEN: ['github', 'modelRepoPrToken'],
  DEBUG_MODE: ['debug', 'enabled'],
  VERBOSE: ['debug', 'verbose'],
  MAX_FILES_PER_DIFF: ['constraints', 'maxFilesPerDiff'],
  MAX_LINES_PER_DIFF: ['constraints', 'maxLinesPerDiff'],
  MAX_CONTEXT_CHARS: ['constraints', 'maxContextChars'],
  GITHUB_TIMEOUT: ['github', 'defaultTimeout'],
  GITLAB_TOKEN: ['gitlab', 'token'],
  GITLAB_BASE_URL: ['gitlab', 'baseUrl'],
  BITBUCKET_TOKEN: ['bitbucket', 'token'],
  BITBUCKET_BASE_URL: ['bitbucket', 'baseUrl'],
  ANTHROPIC_TIMEOUT: ['anthropic', 'timeout'],
  ANTHROPIC_FAST_MODEL: ['anthropic', 'fastModel'],
  ANTHROPIC_ADVANCED_MODEL: ['anthropic', 'advancedModel'],
  GEMINI_FAST_MODEL: ['gemini', 'fastModel'],
  GEMINI_ADVANCED_MODEL: ['gemini', 'advancedModel'],
  OPENAI_API_KEY: ['openai', 'apiKey'],
  OPENAI_TIMEOUT: ['openai', 'timeout'],
  OPENAI_FAST_MODEL: ['openai', 'fastModel'],
  OPENAI_ADVANCED_MODEL: ['openai', 'advancedModel'],
};
function loadConfigFromEnv(): Record<string, Record<string, unknown>> {
  const config = {
    ai: {} as Record<string, unknown>,
    constraints: {} as Record<string, unknown>,
    adapter: { likec4: {} } as Record<string, unknown>,
    github: {} as Record<string, unknown>,
    gitlab: {} as Record<string, unknown>,
    bitbucket: {} as Record<string, unknown>,
    anthropic: {} as Record<string, unknown>,
    gemini: {} as Record<string, unknown>,
    openai: {} as Record<string, unknown>,
    debug: {} as Record<string, unknown>,
    app: {} as Record<string, unknown>,
  };
  for (const [envVar, path] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      const [section, ...rest] = path;
      const key = rest.at(-1);
      if (!section || !key) continue;
      let convertedValue: string | number | boolean | string[] = value;
      if (key === 'provider' || key === 'format') {
        // String enum — pass through as-is
      } else if (key === 'enabled' || key === 'verbose') {
        convertedValue = value.toLowerCase() === 'true';
      } else if (key.includes('max') || key.includes('timeout') || key.includes('Timeout')) {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          convertedValue = numValue;
        }
      } else if (key === 'excludePaths' || key === 'excludeTags') {
        // Parse comma-separated list
        convertedValue = value
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
      }
      const configSection = config[section as keyof Config] as Record<string, unknown> | undefined;
      if (configSection) {
        if (rest.length === 1) {
          configSection[key] = convertedValue;
        } else if (rest.length === 2 && rest[0]) {
          const nested = (configSection[rest[0]] ?? {}) as Record<string, unknown>;
          nested[key] = convertedValue;
          configSection[rest[0]] = nested;
        }
      }
    }
  }
  return config;
}
function validateRequiredConfig(config: Config): void {
  const errors: string[] = [];
  if (!config.debug.enabled) {
    const provider = config.ai.provider;
    if (provider === 'gemini' && !config.gemini.apiKey) {
      errors.push('GEMINI_API_KEY must be set when AI_PROVIDER is gemini');
    } else if (provider === 'anthropic' && !config.anthropic.apiKey) {
      errors.push('ANTHROPIC_API_KEY must be set when AI_PROVIDER is anthropic');
    } else if (provider === 'openai' && !config.openai.apiKey) {
      errors.push('OPENAI_API_KEY must be set when AI_PROVIDER is openai');
    }
  }
  if (errors.length > 0) {
    throw new ConfigurationError(`Configuration check failed: ${errors.join(', ')}`, 'environment');
  }
}
function createConfig(): Config {
  try {
    const envConfig = loadConfigFromEnv();
    const config = ConfigSchema.parse(envConfig);
    validateRequiredConfig(config);
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new ConfigurationError(`Invalid configuration detected: ${issues}`, 'validation');
    }
    throw error;
  }
}
export const CONFIG = createConfig();
