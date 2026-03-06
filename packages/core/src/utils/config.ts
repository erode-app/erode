import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import { ConfigurationError } from '../errors.js';
dotenv.config();

export const RC_FILENAME = '.eroderc.json';

export const ConfigSchema = z.object({
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
    structurizr: z.object({
      cliPath: z.string().optional(),
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
export type Config = z.infer<typeof ConfigSchema>;

export const ENV_VAR_NAMES = {
  aiProvider: 'ERODE_AI_PROVIDER',
  geminiApiKey: 'ERODE_GEMINI_API_KEY',
  anthropicApiKey: 'ERODE_ANTHROPIC_API_KEY',
  openaiApiKey: 'ERODE_OPENAI_API_KEY',
  githubToken: 'ERODE_GITHUB_TOKEN',
  gitlabToken: 'ERODE_GITLAB_TOKEN',
  bitbucketToken: 'ERODE_BITBUCKET_TOKEN',
  structurizrCliPath: 'ERODE_STRUCTURIZR_CLI_PATH',
  modelRepoPrToken: 'ERODE_MODEL_REPO_PR_TOKEN',
} as const;

const ENV_MAP: Record<string, string> = {
  ERODE_AI_PROVIDER: 'ai.provider',
  ERODE_ANTHROPIC_API_KEY: 'anthropic.apiKey',
  ERODE_ANTHROPIC_TIMEOUT: 'anthropic.timeout',
  ERODE_ANTHROPIC_FAST_MODEL: 'anthropic.fastModel',
  ERODE_ANTHROPIC_ADVANCED_MODEL: 'anthropic.advancedModel',
  ERODE_GEMINI_API_KEY: 'gemini.apiKey',
  ERODE_GEMINI_TIMEOUT: 'gemini.timeout',
  ERODE_GEMINI_FAST_MODEL: 'gemini.fastModel',
  ERODE_GEMINI_ADVANCED_MODEL: 'gemini.advancedModel',
  ERODE_OPENAI_API_KEY: 'openai.apiKey',
  ERODE_OPENAI_TIMEOUT: 'openai.timeout',
  ERODE_OPENAI_FAST_MODEL: 'openai.fastModel',
  ERODE_OPENAI_ADVANCED_MODEL: 'openai.advancedModel',
  ERODE_GITHUB_TOKEN: 'github.token',
  ERODE_GITHUB_TIMEOUT: 'github.defaultTimeout',
  ERODE_GITLAB_TOKEN: 'gitlab.token',
  ERODE_GITLAB_BASE_URL: 'gitlab.baseUrl',
  ERODE_BITBUCKET_TOKEN: 'bitbucket.token',
  ERODE_BITBUCKET_BASE_URL: 'bitbucket.baseUrl',
  ERODE_MODEL_FORMAT: 'adapter.format',
  ERODE_MODEL_REPO_PR_TOKEN: 'github.modelRepoPrToken',
  ERODE_LIKEC4_EXCLUDE_PATHS: 'adapter.likec4.excludePaths',
  ERODE_LIKEC4_EXCLUDE_TAGS: 'adapter.likec4.excludeTags',
  ERODE_STRUCTURIZR_CLI_PATH: 'adapter.structurizr.cliPath',
  ERODE_MAX_FILES_PER_DIFF: 'constraints.maxFilesPerDiff',
  ERODE_MAX_LINES_PER_DIFF: 'constraints.maxLinesPerDiff',
  ERODE_MAX_CONTEXT_CHARS: 'constraints.maxContextChars',
  ERODE_DEBUG_MODE: 'debug.enabled',
  ERODE_VERBOSE: 'debug.verbose',
};

type Coercer = (raw: string) => unknown;

const toNumber: Coercer = (raw) => {
  const n = parseInt(raw, 10);
  return isNaN(n) ? raw : n;
};
const toBoolean: Coercer = (raw) => raw.toLowerCase() === 'true';
const toStringArray: Coercer = (raw) =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const identity: Coercer = (raw) => raw;

const COERCE_MAP: Record<string, Coercer> = {
  'debug.enabled': toBoolean,
  'debug.verbose': toBoolean,
  'constraints.maxFilesPerDiff': toNumber,
  'constraints.maxLinesPerDiff': toNumber,
  'constraints.maxContextChars': toNumber,
  'github.defaultTimeout': toNumber,
  'anthropic.timeout': toNumber,
  'gemini.timeout': toNumber,
  'openai.timeout': toNumber,
  'adapter.likec4.excludePaths': toStringArray,
  'adapter.likec4.excludeTags': toStringArray,
};

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (!(seg in current) || typeof current[seg] !== 'object' || current[seg] === null) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }
  const lastKey = segments.at(-1);
  if (lastKey) {
    current[lastKey] = value;
  }
}

function buildConfigSkeleton(): Record<string, unknown> {
  return {
    ai: {},
    constraints: {},
    adapter: { likec4: {}, structurizr: {} },
    github: {},
    gitlab: {},
    bitbucket: {},
    anthropic: {},
    gemini: {},
    openai: {},
    debug: {},
    app: {},
  };
}

/** Check for any `ERODE_*` env vars present in `process.env`. */
function hasErodeEnvVars(): boolean {
  return Object.keys(ENV_MAP).some((key) => process.env[key] !== undefined);
}

/** Find `.eroderc.json` in cwd or home directory. Returns the path or undefined. */
export function findConfigFile(): string | undefined {
  const cwdPath = path.join(process.cwd(), RC_FILENAME);
  if (fs.existsSync(cwdPath)) return cwdPath;

  const homePath = path.join(os.homedir(), RC_FILENAME);
  if (fs.existsSync(homePath)) return homePath;

  return undefined;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

/** Load and parse a `.eroderc.json` config file, merging onto the skeleton for defaults. */
function loadConfigFromFile(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return deepMerge(buildConfigSkeleton(), parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(
      `Failed to load config file ${filePath}: ${message}`,
      'configFile'
    );
  }
}

function loadConfigFromEnv(): Record<string, unknown> {
  const config = buildConfigSkeleton();

  for (const [envVar, dotPath] of Object.entries(ENV_MAP)) {
    const raw = process.env[envVar];
    if (raw === undefined) continue;
    const coerce = COERCE_MAP[dotPath] ?? identity;
    setNestedValue(config, dotPath, coerce(raw));
  }

  return config;
}

function validateRequiredConfig(config: Config): void {
  const errors: string[] = [];
  if (!config.debug.enabled) {
    const provider = config.ai.provider;
    if (provider === 'gemini' && !config.gemini.apiKey) {
      errors.push(
        `${ENV_VAR_NAMES.geminiApiKey} must be set when ${ENV_VAR_NAMES.aiProvider} is gemini`
      );
    } else if (provider === 'anthropic' && !config.anthropic.apiKey) {
      errors.push(
        `${ENV_VAR_NAMES.anthropicApiKey} must be set when ${ENV_VAR_NAMES.aiProvider} is anthropic`
      );
    } else if (provider === 'openai' && !config.openai.apiKey) {
      errors.push(
        `${ENV_VAR_NAMES.openaiApiKey} must be set when ${ENV_VAR_NAMES.aiProvider} is openai`
      );
    }
  }
  if (errors.length > 0) {
    throw new ConfigurationError(`Configuration check failed: ${errors.join(', ')}`, 'environment');
  }
}

function createConfig(): Config {
  try {
    const configFile = findConfigFile();
    const envVarsPresent = hasErodeEnvVars();

    if (configFile && envVarsPresent) {
      throw new ConfigurationError(
        `Found ${RC_FILENAME} at ${configFile} but ERODE_* environment variables are also set. ` +
          `Use one or the other, not both.`,
        'configFile'
      );
    }

    const rawConfig = configFile ? loadConfigFromFile(configFile) : loadConfigFromEnv();
    const config = ConfigSchema.parse(rawConfig);
    validateRequiredConfig(config);
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const summary = error.issues
        .map((issue, idx) => `${String(idx + 1)}. ${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new ConfigurationError(`Config validation failed: ${summary}`, 'validation');
    }
    throw error;
  }
}

export const CONFIG = createConfig();
