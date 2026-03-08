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
import { createAdapter } from '../../adapters/adapter-factory.js';

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

  it('calls validatePath with modelPath and "directory"', async () => {
    mockLoadAndListComponents.mockResolvedValue([]);

    await runComponents({ modelPath: '/some/path' });

    expect(mockValidatePath).toHaveBeenCalledWith('/some/path', 'directory');
  });

  it('passes modelFormat to createAdapter', async () => {
    mockLoadAndListComponents.mockResolvedValue([]);

    await runComponents({ modelPath: '/models/arch', modelFormat: 'structurizr' });

    expect(createAdapter).toHaveBeenCalledWith('structurizr');
  });

  it('passes modelPath to adapter.loadAndListComponents', async () => {
    mockLoadAndListComponents.mockResolvedValue([]);

    await runComponents({ modelPath: '/models/arch' });

    expect(mockLoadAndListComponents).toHaveBeenCalledWith('/models/arch');
  });
});
