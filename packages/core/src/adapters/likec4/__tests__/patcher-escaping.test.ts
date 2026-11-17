import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { LikeC4Patcher } from '../patcher.js';
import { validateLikeC4Dsl } from '../dsl-validator.js';
import type { ComponentIndex, ArchitecturalComponent } from '../../architecture-types.js';
import type { AIProvider } from '../../../providers/ai-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeIndex(ids: string[]): ComponentIndex {
  const byId = new Map<string, ArchitecturalComponent>(
    ids.map((id) => [id, { id, name: id, tags: [], type: 'service' }])
  );
  return { byId, byRepository: new Map() };
}

const provider: AIProvider = {
  extractDependencies: vi.fn(),
  analyzeDrift: vi.fn(),
};

describe('LikeC4Patcher escaping against the LikeC4 parser', () => {
  const fixtureWorkspace = path.join(__dirname, 'fixtures', 'sample-workspace');

  beforeAll(async () => {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.formatAfterPatch = false;
  });

  it('produces DSL that LikeC4 parses when strings contain quotes and backslashes', async () => {
    const patcher = new LikeC4Patcher();
    const result = await patcher.patch({
      modelPath: fixtureWorkspace,
      relationships: [
        {
          source: 'frontend',
          target: 'obrien_api',
          description: "Calls O'Brien API at C:\\api\\",
        },
      ],
      existingRelationships: [],
      componentIndex: makeIndex(['frontend', 'api_gateway']),
      provider,
      newComponents: [
        {
          id: 'obrien_api',
          kind: 'service',
          name: "O'Brien API",
          description: "Wraps O'Brien's billing",
          technology: "Node's runtime",
        },
      ],
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.content).toContain("obrien_api = service 'O\\'Brien API'");
    expect(result.content).toContain(
      "frontend -> obrien_api 'Calls O\\'Brien API at C:\\\\api\\\\'"
    );

    const validation = await validateLikeC4Dsl(
      fixtureWorkspace,
      path.join(fixtureWorkspace, path.basename(result.filePath)),
      result.content
    );
    expect(validation).toEqual({ valid: true });
  }, 60_000);
});
