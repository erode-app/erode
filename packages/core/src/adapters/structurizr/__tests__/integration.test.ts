import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { describe, it, expect, beforeEach } from 'vitest';
import { StructurizrAdapter } from '../adapter.js';
import { AdapterError } from '../../../errors.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAdapterContractTests } from '../../__tests__/adapter-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('StructurizrAdapter Integration', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'sample-workspace');
  const fixtureWorkspace = path.join(fixtureDir, 'workspace.json');
  let adapter: StructurizrAdapter;

  beforeEach(async () => {
    adapter = new StructurizrAdapter();
    await adapter.loadFromPath(fixtureWorkspace);
  });

  runAdapterContractTests(() => adapter);

  describe('Structurizr-specific', () => {
    it('should handle file operations without errors', async () => {
      const freshAdapter = new StructurizrAdapter();
      const startTime = performance.now();
      await freshAdapter.loadFromPath(fixtureWorkspace);
      const loadTime = performance.now() - startTime;
      expect(loadTime).toBeGreaterThan(0);
    });

    it('should filter built-in Structurizr tags', () => {
      const components = adapter.getAllComponents();
      for (const component of components) {
        expect(component.tags).not.toContain('Element');
        expect(component.tags).not.toContain('Software System');
        expect(component.tags).not.toContain('Person');
        expect(component.tags).not.toContain('Container');
        expect(component.tags).not.toContain('Component');
      }
    });

    it('should load JSON and resolve all expected components', () => {
      const components = adapter.getAllComponents();
      expect(components.length).toBeGreaterThanOrEqual(5);

      const ids = components.map((c) => c.id);
      expect(ids).toContain('frontend');
      expect(ids).toContain('api_gateway');
      expect(ids).toContain('user_service');
      expect(ids).toContain('product_service');
      expect(ids).toContain('database');
    });

    it('should parse tags with multiple values', () => {
      const userService = adapter.findComponentById('user_service');
      expect(userService).toBeDefined();
      expect(userService?.tags).toContain('backend');
      expect(userService?.tags).toContain('microservice');
    });

    it('should parse implicit relationships inside elements', () => {
      const relationships = adapter.getComponentRelationships('api_gateway');
      expect(relationships.length).toBe(3);
    });

    it('should parse model-level relationships', () => {
      expect(adapter.isAllowedDependency('frontend', 'api_gateway')).toBe(true);
    });
  });

  describe('Directory path resolution', () => {
    it('should resolve a directory to workspace.json when present', async () => {
      const dirAdapter = new StructurizrAdapter();
      await dirAdapter.loadFromPath(fixtureDir);
      const components = dirAdapter.getAllComponents();
      expect(components.length).toBeGreaterThanOrEqual(5);
    });

    it('should resolve a directory to workspace.dsl when only DSL exists', async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), 'erode-structurizr-'));
      writeFileSync(path.join(tmp, 'workspace.dsl'), 'workspace { model { } }');
      const dirAdapter = new StructurizrAdapter();
      // DSL requires CLI to export; just verify it resolves past directory check
      // and fails at the CLI step, not at "no workspace file found"
      await expect(dirAdapter.loadFromPath(tmp)).rejects.not.toThrow(
        /No workspace file found in directory/
      );
    });

    it('should throw when directory has no workspace file', async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), 'erode-structurizr-'));
      mkdirSync(path.join(tmp, 'subdir'), { recursive: true });
      const dirAdapter = new StructurizrAdapter();
      await expect(dirAdapter.loadFromPath(tmp)).rejects.toThrow(AdapterError);
      await expect(dirAdapter.loadFromPath(tmp)).rejects.toThrow(
        /No workspace file found in directory/
      );
    });

    it('should still accept a direct file path', async () => {
      const dirAdapter = new StructurizrAdapter();
      await dirAdapter.loadFromPath(fixtureWorkspace);
      expect(dirAdapter.getAllComponents().length).toBeGreaterThanOrEqual(5);
    });

    it('should resolve directory via loadAndListComponents', async () => {
      const dirAdapter = new StructurizrAdapter();
      const components = await dirAdapter.loadAndListComponents(fixtureDir);
      expect(components.length).toBeGreaterThanOrEqual(5);
    });
  });
});
