import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// Mock fs before importing config.js so the module-level createConfig()
// doesn't find a real .eroderc.json on disk.
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

import * as fs from 'fs';
import {
  findConfigFile,
  RC_FILENAME,
  ENV_VAR_NAMES,
  deepMerge,
  loadConfigFromFile,
  loadConfigFromEnv,
} from '../config.js';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

describe('config file support', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
  });

  describe('RC_FILENAME', () => {
    it('should be .eroderc.json', () => {
      expect(RC_FILENAME).toBe('.eroderc.json');
    });
  });

  describe('findConfigFile', () => {
    it('should return cwd path when config file exists there', () => {
      const cwdPath = path.join(process.cwd(), '.eroderc.json');
      mockExistsSync.mockImplementation((p) => p === cwdPath);

      expect(findConfigFile()).toBe(cwdPath);
    });

    it('should return home path when config file only exists in home dir', () => {
      const homePath = path.join(os.homedir(), '.eroderc.json');
      mockExistsSync.mockImplementation((p) => p === homePath);

      expect(findConfigFile()).toBe(homePath);
    });

    it('should return undefined when no config file exists', () => {
      mockExistsSync.mockReturnValue(false);

      expect(findConfigFile()).toBeUndefined();
    });

    it('should prefer cwd over home directory when both exist', () => {
      mockExistsSync.mockReturnValue(true);

      const cwdPath = path.join(process.cwd(), '.eroderc.json');
      expect(findConfigFile()).toBe(cwdPath);
    });

    it('should check cwd path before home path', () => {
      mockExistsSync.mockReturnValue(false);
      findConfigFile();

      const cwdPath = path.join(process.cwd(), '.eroderc.json');
      const homePath = path.join(os.homedir(), '.eroderc.json');
      expect(mockExistsSync).toHaveBeenCalledWith(cwdPath);
      expect(mockExistsSync).toHaveBeenCalledWith(homePath);

      // cwd should be checked first
      const calls = mockExistsSync.mock.calls.map((c) => c[0]);
      expect(calls.indexOf(cwdPath)).toBeLessThan(calls.indexOf(homePath));
    });

    it('should not check home path if cwd path exists', () => {
      const cwdPath = path.join(process.cwd(), '.eroderc.json');
      mockExistsSync.mockImplementation((p) => p === cwdPath);

      findConfigFile();

      // Only one call should have been made (to cwdPath)
      expect(mockExistsSync).toHaveBeenCalledTimes(1);
      expect(mockExistsSync).toHaveBeenCalledWith(cwdPath);
    });
  });

  describe('ENV_VAR_NAMES', () => {
    it('should have all expected keys', () => {
      expect(ENV_VAR_NAMES).toHaveProperty('aiProvider');
      expect(ENV_VAR_NAMES).toHaveProperty('geminiApiKey');
      expect(ENV_VAR_NAMES).toHaveProperty('anthropicApiKey');
      expect(ENV_VAR_NAMES).toHaveProperty('openaiApiKey');
      expect(ENV_VAR_NAMES).toHaveProperty('githubToken');
      expect(ENV_VAR_NAMES).toHaveProperty('gitlabToken');
      expect(ENV_VAR_NAMES).toHaveProperty('bitbucketToken');
      expect(ENV_VAR_NAMES).toHaveProperty('structurizrCliPath');
      expect(ENV_VAR_NAMES).toHaveProperty('modelRepoPrToken');
      expect(ENV_VAR_NAMES).toHaveProperty('modelPath');
      expect(ENV_VAR_NAMES).toHaveProperty('modelRepo');
      expect(ENV_VAR_NAMES).toHaveProperty('modelRef');
    });

    it('should have all values prefixed with ERODE_', () => {
      for (const value of Object.values(ENV_VAR_NAMES)) {
        expect(value).toMatch(/^ERODE_/);
      }
    });

    it('should map aiProvider to ERODE_AI_PROVIDER', () => {
      expect(ENV_VAR_NAMES.aiProvider).toBe('ERODE_AI_PROVIDER');
    });

    it('should map geminiApiKey to ERODE_GEMINI_API_KEY', () => {
      expect(ENV_VAR_NAMES.geminiApiKey).toBe('ERODE_GEMINI_API_KEY');
    });

    it('should map anthropicApiKey to ERODE_ANTHROPIC_API_KEY', () => {
      expect(ENV_VAR_NAMES.anthropicApiKey).toBe('ERODE_ANTHROPIC_API_KEY');
    });

    it('should map openaiApiKey to ERODE_OPENAI_API_KEY', () => {
      expect(ENV_VAR_NAMES.openaiApiKey).toBe('ERODE_OPENAI_API_KEY');
    });

    it('should map githubToken to ERODE_GITHUB_TOKEN', () => {
      expect(ENV_VAR_NAMES.githubToken).toBe('ERODE_GITHUB_TOKEN');
    });

    it('should map gitlabToken to ERODE_GITLAB_TOKEN', () => {
      expect(ENV_VAR_NAMES.gitlabToken).toBe('ERODE_GITLAB_TOKEN');
    });

    it('should map bitbucketToken to ERODE_BITBUCKET_TOKEN', () => {
      expect(ENV_VAR_NAMES.bitbucketToken).toBe('ERODE_BITBUCKET_TOKEN');
    });

    it('should map structurizrCliPath to ERODE_STRUCTURIZR_CLI_PATH', () => {
      expect(ENV_VAR_NAMES.structurizrCliPath).toBe('ERODE_STRUCTURIZR_CLI_PATH');
    });

    it('should map modelRepoPrToken to ERODE_MODEL_REPO_PR_TOKEN', () => {
      expect(ENV_VAR_NAMES.modelRepoPrToken).toBe('ERODE_MODEL_REPO_PR_TOKEN');
    });

    it('should map modelPath to ERODE_MODEL_PATH', () => {
      expect(ENV_VAR_NAMES.modelPath).toBe('ERODE_MODEL_PATH');
    });

    it('should map modelRepo to ERODE_MODEL_REPO', () => {
      expect(ENV_VAR_NAMES.modelRepo).toBe('ERODE_MODEL_REPO');
    });

    it('should map modelRef to ERODE_MODEL_REF', () => {
      expect(ENV_VAR_NAMES.modelRef).toBe('ERODE_MODEL_REF');
    });
  });

  describe('deepMerge', () => {
    it('should override target values with source values', () => {
      const target = { ai: { provider: 'gemini' } };
      const source = { ai: { provider: 'anthropic' } };
      const result = deepMerge(
        target as Record<string, unknown>,
        source as Record<string, unknown>
      );
      expect(result).toEqual({ ai: { provider: 'anthropic' } });
    });

    it('should preserve target values when source has no matching key', () => {
      const target = { ai: { provider: 'gemini' }, gemini: { apiKey: 'key123' } };
      const source = { ai: {} };
      const result = deepMerge(
        target as Record<string, unknown>,
        source as Record<string, unknown>
      );
      expect(result).toEqual({ ai: { provider: 'gemini' }, gemini: { apiKey: 'key123' } });
    });

    it('should merge nested objects recursively', () => {
      const target = { adapter: { format: 'likec4', likec4: { excludePaths: [] } } };
      const source = { adapter: { format: 'structurizr' } };
      const result = deepMerge(
        target as Record<string, unknown>,
        source as Record<string, unknown>
      );
      expect(result).toEqual({
        adapter: { format: 'structurizr', likec4: { excludePaths: [] } },
      });
    });

    it('should replace arrays instead of merging them', () => {
      const target = { adapter: { likec4: { excludePaths: ['a', 'b'] } } };
      const source = { adapter: { likec4: { excludePaths: ['c'] } } };
      const result = deepMerge(
        target as Record<string, unknown>,
        source as Record<string, unknown>
      );
      expect(result).toEqual({ adapter: { likec4: { excludePaths: ['c'] } } });
    });
  });

  describe('config merge strategy', () => {
    it('should load values from file when no env vars are set', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ ai: { provider: 'anthropic' }, gemini: { apiKey: 'file-key' } })
      );
      const fileConfig = loadConfigFromFile('/fake/.eroderc.json');
      expect(fileConfig).toMatchObject({
        ai: { provider: 'anthropic' },
        gemini: { apiKey: 'file-key' },
      });
    });

    it('should allow env vars to override file values via deepMerge', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ ai: { provider: 'gemini' }, gemini: { apiKey: 'file-key' } })
      );
      const fileConfig = loadConfigFromFile('/fake/.eroderc.json');

      // Simulate env config that only sets ai.provider
      const envConfig = {
        ai: { provider: 'anthropic' },
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

      const merged = deepMerge(fileConfig, envConfig as Record<string, unknown>);
      // Env var wins for ai.provider
      expect(merged).toMatchObject({ ai: { provider: 'anthropic' } });
      // File value preserved for gemini.apiKey (env skeleton has empty gemini object)
      expect(merged).toMatchObject({ gemini: { apiKey: 'file-key' } });
    });

    it('should pick up env vars via loadConfigFromEnv only for set vars', () => {
      const original = process.env['ERODE_AI_PROVIDER'];
      process.env['ERODE_AI_PROVIDER'] = 'openai';
      try {
        const envConfig = loadConfigFromEnv();
        expect(envConfig).toMatchObject({ ai: { provider: 'openai' } });
      } finally {
        if (original === undefined) {
          delete process.env['ERODE_AI_PROVIDER'];
        } else {
          process.env['ERODE_AI_PROVIDER'] = original;
        }
      }
    });
  });
});
