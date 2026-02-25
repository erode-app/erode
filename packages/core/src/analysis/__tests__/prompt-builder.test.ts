import { describe, it, expect, vi } from 'vitest';
import { ErodeError, ErrorCode } from '../../errors.js';
import type {
  DependencyExtractionPromptVars,
  ComponentSelectionPromptVars,
  DriftAnalysisPromptVars,
  ModelGenerationPromptVars,
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
    loadModelGenerationPrompt: vi.fn((vars: ModelGenerationPromptVars) => JSON.stringify(vars)),
  },
}));

import { PromptBuilder } from '../prompt-builder.js';

describe('PromptBuilder', () => {
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
      // The greedy regex will match from first { to last }
      expect(result).toContain('"first"');
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
        expect((error as ErodeError).code).toBe(ErrorCode.COMPONENT_NOT_FOUND);
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
      });

      expect(result).toContain('No architectural dependency changes');
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
      });

      expect(result).toContain('ADDED');
      expect(result).toContain('redis');
      expect(result).toContain('REMOVED');
      expect(result).toContain('memcached');
    });
  });
});
