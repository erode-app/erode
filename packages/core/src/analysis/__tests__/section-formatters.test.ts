import { describe, it, expect } from 'vitest';
import {
  formatAllowedDependencies,
  formatDependents,
  formatDependencyChanges,
  formatComponentContext,
  formatComponentList,
  formatCommits,
} from '../section-formatters.js';

describe('section-formatters', () => {
  describe('formatAllowedDependencies', () => {
    it('should group relationships by target with kinds', () => {
      const result = formatAllowedDependencies({
        relationships: [
          { target: { id: 'db', name: 'Database' }, kind: 'uses' },
          { target: { id: 'db', name: 'Database' }, kind: 'reads' },
          { target: { id: 'cache', name: 'Cache' }, kind: 'uses' },
        ],
        dependencies: [],
      });
      expect(result).toContain('Database (db) [via: uses, reads]');
      expect(result).toContain('Cache (cache) [via: uses]');
    });

    it('should fall back to flat dependency list when no relationships', () => {
      const result = formatAllowedDependencies({
        relationships: [],
        dependencies: [
          { id: 'db', name: 'Database', type: 'database' },
          { id: 'cache', name: 'Cache', type: 'service' },
        ],
      });
      expect(result).toContain('Database (database)');
      expect(result).toContain('Cache (service)');
    });

    it('should return "No declared dependencies" when empty', () => {
      const result = formatAllowedDependencies({
        relationships: [],
        dependencies: [],
      });
      expect(result).toContain('No declared dependencies');
    });

    it('should handle relationships with undefined kind as "unknown"', () => {
      const result = formatAllowedDependencies({
        relationships: [{ target: { id: 'svc', name: 'Service' } }],
        dependencies: [],
      });
      expect(result).toContain('Service (svc) [via: unknown]');
    });
  });

  describe('formatDependents', () => {
    it('should format dependents list', () => {
      const result = formatDependents([
        { name: 'Frontend', type: 'webapp' },
        { name: 'Mobile', type: 'app' },
      ]);
      expect(result).toContain('Frontend (webapp)');
      expect(result).toContain('Mobile (app)');
    });

    it('should return "No dependents" when empty', () => {
      expect(formatDependents([])).toBe('  - No dependents');
    });
  });

  describe('formatDependencyChanges', () => {
    it('should return no-changes message for empty dependencies', () => {
      const result = formatDependencyChanges({ dependencies: [], summary: '' });
      expect(result).toContain('No architectural dependency changes');
    });

    it('should format added dependencies', () => {
      const result = formatDependencyChanges({
        dependencies: [
          {
            type: 'added',
            file: 'src/a.ts',
            dependency: 'redis',
            description: 'Added Redis',
            code: '',
          },
        ],
        summary: '',
      });
      expect(result).toContain('**ADDED Dependencies:**');
      expect(result).toContain('redis (src/a.ts)');
      expect(result).toContain('Added Redis');
    });

    it('should format modified dependencies', () => {
      const result = formatDependencyChanges({
        dependencies: [
          {
            type: 'modified',
            file: 'src/b.ts',
            dependency: 'pg',
            description: 'Updated PG',
            code: '',
          },
        ],
        summary: '',
      });
      expect(result).toContain('**MODIFIED Dependencies:**');
      expect(result).toContain('pg (src/b.ts)');
    });

    it('should format removed dependencies', () => {
      const result = formatDependencyChanges({
        dependencies: [
          {
            type: 'removed',
            file: 'src/c.ts',
            dependency: 'mysql',
            description: 'Removed MySQL',
            code: '',
          },
        ],
        summary: '',
      });
      expect(result).toContain('**REMOVED Dependencies:**');
      expect(result).toContain('mysql (src/c.ts)');
    });

    it('should format all types together', () => {
      const result = formatDependencyChanges({
        dependencies: [
          { type: 'added', file: 'a.ts', dependency: 'redis', description: 'new', code: '' },
          { type: 'modified', file: 'b.ts', dependency: 'pg', description: 'updated', code: '' },
          { type: 'removed', file: 'c.ts', dependency: 'mysql', description: 'gone', code: '' },
        ],
        summary: '',
      });
      expect(result).toContain('**ADDED');
      expect(result).toContain('**MODIFIED');
      expect(result).toContain('**REMOVED');
    });
  });

  describe('formatComponentContext', () => {
    it('should format component with technology', () => {
      const result = formatComponentContext({
        name: 'API',
        id: 'comp.api',
        type: 'service',
        technology: 'Node.js',
      });
      expect(result).toContain('Component: API (comp.api)');
      expect(result).toContain('Type: service');
      expect(result).toContain('Technology: Node.js');
    });

    it('should omit technology when not provided', () => {
      const result = formatComponentContext({
        name: 'API',
        id: 'comp.api',
        type: 'service',
      });
      expect(result).toContain('Component: API (comp.api)');
      expect(result).not.toContain('Technology');
    });
  });

  describe('formatComponentList', () => {
    it('should format numbered list of components', () => {
      const result = formatComponentList([
        {
          id: 'comp.api',
          name: 'API',
          type: 'service',
          technology: 'Express',
          description: 'REST API',
        },
        { id: 'comp.web', name: 'Web', type: 'webapp' },
      ]);
      expect(result).toContain('1. **comp.api**');
      expect(result).toContain('Name: API');
      expect(result).toContain('Technology: Express');
      expect(result).toContain('Description: REST API');
      expect(result).toContain('2. **comp.web**');
    });
  });

  describe('formatCommits', () => {
    it('should format commits under 10', () => {
      const commits = [
        { sha: 'abc1234567', message: 'Fix bug', author: 'dev' },
        { sha: 'def5678901', message: 'Add feature', author: 'dev2' },
      ];
      const { section, note } = formatCommits(commits);
      expect(section).toContain('abc1234: Fix bug (dev)');
      expect(section).toContain('def5678: Add feature (dev2)');
      expect(note).toBe('');
    });

    it('should truncate at 10 commits with overflow note', () => {
      const commits = Array.from({ length: 15 }, (_, i) => ({
        sha: `sha${String(i).padStart(10, '0')}`,
        message: `Commit ${String(i)}`,
        author: 'dev',
      }));
      const { section, note } = formatCommits(commits);
      expect(section.split('\n')).toHaveLength(10);
      expect(note).toContain('5 more commits');
    });

    it('should handle exactly 10 commits with no overflow note', () => {
      const commits = Array.from({ length: 10 }, (_, i) => ({
        sha: `sha${String(i).padStart(10, '0')}`,
        message: `Commit ${String(i)}`,
        author: 'dev',
      }));
      const { section, note } = formatCommits(commits);
      expect(section.split('\n')).toHaveLength(10);
      expect(note).toBe('');
    });
  });
});
