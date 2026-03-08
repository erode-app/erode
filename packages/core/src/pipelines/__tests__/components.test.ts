import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions ────────────────────────────────────────────────
const { mockLoadAndListComponents, mockValidatePath } = vi.hoisted(() => ({
  mockLoadAndListComponents: vi.fn(),
  mockValidatePath: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock('../../adapters/adapter-factory.js', () => ({
  createAdapter: vi.fn(() => ({
    metadata: { displayName: 'LikeC4' },
    loadAndListComponents: mockLoadAndListComponents,
  })),
}));

vi.mock('../../utils/validation.js', () => ({
  validatePath: mockValidatePath,
}));

vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    debug: { verbose: false },
    adapter: { likec4: { excludePaths: [], excludeTags: [] } },
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────
import { runComponents } from '../components.js';

describe('runComponents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns components from adapter.loadAndListComponents', async () => {
    const fakeComponents = [
      { id: 'svc-a', title: 'Service A', kind: 'service', links: [], tags: [] },
      { id: 'svc-b', title: 'Service B', kind: 'database', links: [], tags: ['internal'] },
    ];
    mockLoadAndListComponents.mockResolvedValue(fakeComponents);

    const result = await runComponents({ modelPath: '/models/arch' });

    expect(result).toEqual(fakeComponents);
  });
});
