import { describe, it, expect, beforeEach } from 'vitest';
import { LikeC4Adapter } from '../adapter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAdapterContractTests } from '../../__tests__/adapter-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LikeC4Adapter Integration', () => {
  const fixtureWorkspace = path.join(__dirname, 'fixtures', 'sample-workspace');
  let adapter: LikeC4Adapter;

  beforeEach(async () => {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = [];
    configModule.CONFIG.adapter.likec4.excludeTags = [];

    adapter = new LikeC4Adapter();
    await adapter.loadFromPath(fixtureWorkspace);
  });

  runAdapterContractTests(() => adapter);

  describe('LikeC4-specific', () => {
    it('should handle file operations without errors', async () => {
      const freshAdapter = new LikeC4Adapter();
      const startTime = performance.now();
      await freshAdapter.loadFromPath(fixtureWorkspace);
      const loadTime = performance.now() - startTime;
      expect(loadTime).toBeGreaterThan(0);
    });
  });
});
