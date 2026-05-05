import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ErodeError, ErrorCode } from '../../errors.js';
import type {
  DependencyExtractionPromptVars,
  ComponentSelectionPromptVars,
  DriftAnalysisPromptVars,
  ModelPatchPromptVars,
} from '../prompt-variables.js';

// Mock the TemplateEngine to avoid filesystem reads
vi.mock('../template-engine.js', () => ({
  TemplateEngine: {
    loadDependencyExtractionPrompt: vi.fn((vars: DependencyExtractionPromptVars) =>
      JSON.stringify(vars)
    ),
    loadComponentSelectionPrompt: vi.fn((vars: ComponentSelectionPromptVars) =>
      JSON.stringify(vars)
    ),
    loadDriftAnalysisPrompt: vi.fn((vars: DriftAnalysisPromptVars) => JSON.stringify(vars)),
    loadModelPatchPrompt: vi.fn((vars: ModelPatchPromptVars) => JSON.stringify(vars)),
    loadSyntaxGuide: vi.fn(
      (_adapterDir: string, _name: string) =>
        '## LikeC4 DSL SYNTAX REFERENCE\nMocked syntax guide content'
    ),
  },
}));

import { PromptBuilder } from '../prompt-builder.js';
import { TemplateEngine } from '../template-engine.js';

describe('PromptBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractJson', () => {
    it('should extract JSON from markdown code block', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = PromptBuilder.extractJson(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('should extract bare JSON object', () => {
      const input = 'Some text {"key": "value"} more text';
      const result = PromptBuilder.extractJson(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('should extract first JSON when multiple exist', () => {
      const input = '{"first": 1} and {"second": 2}';
      const result = PromptBuilder.extractJson(input);
      // Bracket-counting finds the first complete JSON object
      expect(result).toBe('{"first": 1}');
    });

    it('should return null when no JSON found', () => {
      const result = PromptBuilder.extractJson('no json here');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = PromptBuilder.extractJson('');
      expect(result).toBeNull();
    });

    it('should handle nested JSON objects', () => {
      const input = '{"outer": {"inner": "value"}}';
      const result = PromptBuilder.extractJson(input);
      expect(result).toBe(input);
    });
  });

  describe('buildDependencyExtractionPrompt', () => {
    const baseData = {
      diff: 'diff --git a/src/index.ts\n+import redis',
      commit: { sha: 'abc123', message: 'Add redis', author: 'dev' },
      repository: { owner: 'org', repo: 'app', url: 'https://github.com/org/app' },
    };

    it('should build prompt with a single component', () => {
      const result = PromptBuilder.buildDependencyExtractionPrompt({
        ...baseData,
        components: [{ id: 'comp.api', name: 'API Service', type: 'service' }],
      });
      expect(result).toContain('API Service');
      expect(result).toContain('comp.api');
    });

    it('should handle zero components (unmapped repository)', () => {
      const result = PromptBuilder.buildDependencyExtractionPrompt({
        ...baseData,
        components: [],
      });
      expect(result).toContain('Unknown');
    });

    it('should handle undefined components', () => {
      const result = PromptBuilder.buildDependencyExtractionPrompt({
        ...baseData,
        components: undefined,
      });
      expect(result).toContain('Unknown');
    });

    it('should throw when more than one component is provided', () => {
      expect(() =>
        PromptBuilder.buildDependencyExtractionPrompt({
          ...baseData,
          components: [
            { id: 'comp.a', name: 'A', type: 'service' },
            { id: 'comp.b', name: 'B', type: 'service' },
          ],
        })
      ).toThrow(ErodeError);

      try {
        PromptBuilder.buildDependencyExtractionPrompt({
          ...baseData,
          components: [
            { id: 'comp.a', name: 'A', type: 'service' },
            { id: 'comp.b', name: 'B', type: 'service' },
          ],
        });
      } catch (error) {
        expect((error as ErodeError).code).toBe(ErrorCode.MODEL_COMPONENT_MISSING);
      }
    });

    it('should include technology when provided', () => {
      const result = PromptBuilder.buildDependencyExtractionPrompt({
        ...baseData,
        components: [{ id: 'comp.api', name: 'API', type: 'service', technology: 'Node.js' }],
      });
      expect(result).toContain('Node.js');
    });
  });

  describe('buildComponentSelectionPrompt', () => {
    it('should format components and files', () => {
      const result = PromptBuilder.buildComponentSelectionPrompt({
        components: [
          { id: 'comp.api', name: 'API', type: 'service', tags: [] },
          { id: 'comp.web', name: 'Web', type: 'webapp', tags: [] },
        ],
        files: [{ filename: 'src/api/index.ts' }, { filename: 'src/web/app.ts' }],
      });

      expect(result).toContain('comp.api');
      expect(result).toContain('comp.web');
      expect(result).toContain('src/api/index.ts');
      expect(result).toContain('src/web/app.ts');
    });

    it('should include description and technology when available', () => {
      const result = PromptBuilder.buildComponentSelectionPrompt({
        components: [
          {
            id: 'comp.api',
            name: 'API',
            type: 'service',
            tags: [],
            technology: 'Express',
            description: 'REST API service',
          },
        ],
        files: [{ filename: 'src/index.ts' }],
      });

      expect(result).toContain('Express');
      expect(result).toContain('REST API service');
    });
  });

  describe('dependency-extraction template content', () => {
    it('should include route handler outbound call exception in ignore section', () => {
      const templateDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
      const template = readFileSync(join(templateDir, 'dependency-extraction.md'), 'utf-8');
      expect(template).toContain('EXCEPTION');
      expect(template).toContain('outbound HTTP calls');
    });
  });

  describe('buildDependencyChangesSection', () => {
    // buildDependencyChangesSection is private, so we test it indirectly through buildDriftAnalysisPrompt
    // We can still verify its behavior by checking the output of buildDriftAnalysisPrompt

    it('should be invoked through buildDriftAnalysisPrompt with no dependencies', () => {
      const result = PromptBuilder.buildDriftAnalysisPrompt({
        changeRequest: {
          number: 1,
          title: 'Test',
          description: null,
          repository: 'org/repo',
          author: { login: 'dev' },
          base: { ref: 'main', sha: 'base' },
          head: { ref: 'feature', sha: 'head' },
          stats: { commits: 1, additions: 1, deletions: 0, files_changed: 1 },
          commits: [{ sha: 'head', message: 'Test', author: 'dev' }],
        },
        component: { id: 'comp.api', name: 'API', type: 'service', tags: [] },
        dependencies: { dependencies: [], summary: 'No changes' },
        architectural: { dependencies: [], dependents: [], relationships: [] },
        allRelationships: [{ source: 'comp.api', target: 'comp.db', kind: 'uses' }],
      });

      expect(result).toContain('No architectural dependency changes');
    });

    it('should use PR context labels when number > 0', () => {
      const result = PromptBuilder.buildDriftAnalysisPrompt({
        changeRequest: {
          number: 42,
          title: 'Add payments',
          description: null,
          repository: 'org/repo',
          author: { login: 'dev' },
          base: { ref: 'main', sha: 'base' },
          head: { ref: 'feature', sha: 'head' },
          stats: { commits: 1, additions: 1, deletions: 0, files_changed: 1 },
          commits: [],
        },
        component: { id: 'comp.api', name: 'API', type: 'service', tags: [] },
        dependencies: { dependencies: [], summary: '' },
        architectural: { dependencies: [], dependents: [], relationships: [] },
      });

      // Template vars are JSON-serialized in test env (template file not on disk)
      expect(result).toContain('a pull request');
      expect(result).toContain('PULL REQUEST');
      expect(result).toContain('PR #42:');
      expect(result).toContain('IN THIS PR');
    });

    it('should use local context labels when number is 0', () => {
      const result = PromptBuilder.buildDriftAnalysisPrompt({
        changeRequest: {
          number: 0,
          title: 'Local changes',
          description: null,
          repository: 'org/repo',
          author: { login: 'local' },
          base: { ref: 'HEAD', sha: '' },
          head: { ref: 'working-tree', sha: '' },
          stats: { commits: 0, additions: 5, deletions: 2, files_changed: 3 },
          commits: [],
        },
        component: { id: 'comp.api', name: 'API', type: 'service', tags: [] },
        dependencies: { dependencies: [], summary: '' },
        architectural: { dependencies: [], dependents: [], relationships: [] },
      });

      expect(result).toContain('local changes');
      expect(result).toContain('LOCAL CHANGES');
      expect(result).toContain('Changes:');
      expect(result).not.toContain('IN THIS PR');
      expect(result).not.toContain('PULL REQUEST');
    });

    it('should format added/modified/removed dependencies through buildDriftAnalysisPrompt', () => {
      const result = PromptBuilder.buildDriftAnalysisPrompt({
        changeRequest: {
          number: 1,
          title: 'Test',
          description: null,
          repository: 'org/repo',
          author: { login: 'dev' },
          base: { ref: 'main', sha: 'base' },
          head: { ref: 'feature', sha: 'head' },
          stats: { commits: 1, additions: 10, deletions: 5, files_changed: 3 },
          commits: [{ sha: 'head', message: 'Test', author: 'dev' }],
        },
        component: { id: 'comp.api', name: 'API', type: 'service', tags: [] },
        dependencies: {
          dependencies: [
            {
              type: 'added',
              file: 'src/cache.ts',
              dependency: 'redis',
              description: 'Added Redis',
              code: 'import redis',
            },
            {
              type: 'removed',
              file: 'src/old.ts',
              dependency: 'memcached',
              description: 'Removed Memcached',
              code: '',
            },
          ],
          summary: 'Replaced memcached with redis',
        },
        architectural: { dependencies: [], dependents: [], relationships: [] },
        allRelationships: [],
      });

      expect(result).toContain('ADDED');
      expect(result).toContain('redis');
      expect(result).toContain('REMOVED');
      expect(result).toContain('memcached');
    });

    it('should preserve dependency evidence for drift analysis', () => {
      const result = PromptBuilder.buildDriftAnalysisPrompt({
        changeRequest: {
          number: 1,
          title: 'Add service dependency',
          description: null,
          repository: 'org/repo',
          author: { login: 'dev' },
          base: { ref: 'main', sha: 'base' },
          head: { ref: 'feature', sha: 'head' },
          stats: { commits: 1, additions: 10, deletions: 0, files_changed: 2 },
          commits: [{ sha: 'head', message: 'Test', author: 'dev' }],
        },
        component: { id: 'api_gateway', name: 'API Gateway', type: 'service', tags: [] },
        dependencies: {
          dependencies: [
            {
              type: 'added',
              file: 'packages/api-gateway/src/index.ts',
              dependency: 'Order Service',
              description: 'Existing component calls newly introduced service',
              code: 'const ORDER_SERVICE = "http://order-service:3005";',
            },
            {
              type: 'added',
              file: 'packages/order-service/src/index.ts',
              dependency: 'Product Service',
              description: 'Newly introduced service calls existing component',
              code: 'const PRODUCT_SERVICE = "http://product-service:3002";',
            },
            {
              type: 'added',
              file: 'packages/product-service/src/index.ts',
              dependency: 'User Service',
              description: 'Existing component calls existing component',
              code: 'const USER_SERVICE = "http://user-service:3001";',
            },
          ],
          summary: 'Added service relationships',
        },
        architectural: { dependencies: [], dependents: [], relationships: [] },
        allRelationships: [],
      });

      expect(result).toContain('Evidence: const ORDER_SERVICE');
      expect(result).toContain('Evidence: const PRODUCT_SERVICE');
      expect(result).toContain('Evidence: const USER_SERVICE');
    });

    it('should instruct drift analysis to account for every added dependency', () => {
      const templateDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
      const template = readFileSync(join(templateDir, 'drift-analysis.md'), 'utf-8');

      expect(template).toContain('For every ADDED dependency');
      expect(template).toContain('Classify each dependency');
      expect(template).toContain('New component plus relationship to add');
      expect(template).toContain('Do not let one dependency that created a new component');
    });
  });

  describe('buildModelPatchPrompt', () => {
    it('should include syntax guide for likec4 format', () => {
      // The mock returns JSON.stringify(vars), so we can parse and check
      const result = PromptBuilder.buildModelPatchPrompt({
        fileContent: 'model { }',
        linesToInsert: ['  api -> db'],
        modelFormat: 'likec4',
      });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('modelFormat', 'likec4');
      expect(parsed).toHaveProperty('syntaxGuide');
      expect(parsed['syntaxGuide']).toContain('LikeC4 DSL SYNTAX REFERENCE');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(TemplateEngine.loadSyntaxGuide).toHaveBeenCalledWith('likec4', 'likec4-syntax-guide');
    });

    it('should pass empty syntax guide for structurizr format', () => {
      const result = PromptBuilder.buildModelPatchPrompt({
        fileContent: 'workspace { }',
        linesToInsert: ['  api -> db'],
        modelFormat: 'structurizr',
      });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('modelFormat', 'structurizr');
      expect(parsed).toHaveProperty('syntaxGuide', '');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(TemplateEngine.loadSyntaxGuide).not.toHaveBeenCalled();
    });

    it('should join multiple lines to insert', () => {
      const result = PromptBuilder.buildModelPatchPrompt({
        fileContent: 'model { }',
        linesToInsert: ['  api -> db', '  api -> cache'],
        modelFormat: 'likec4',
      });
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('linesToInsert', '  api -> db\n  api -> cache');
    });
  });
});
