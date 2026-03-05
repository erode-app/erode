import { describe, it, expect, vi } from 'vitest';

vi.mock('../../adapters/adapter-factory.js', () => ({
  createAdapter: vi.fn(),
}));

vi.mock('../../utils/validation.js', () => ({
  validatePath: vi.fn(),
}));

import { runValidate } from '../validate.js';
import { createAdapter } from '../../adapters/adapter-factory.js';

function makeMockAdapter(components: { id: string; links: string[] }[]) {
  return {
    metadata: {
      id: 'likec4',
      displayName: 'LikeC4',
      missingLinksHelpLines: [],
    },
    checkVersion: () => ({ found: true, compatible: true, version: '1.0.0', minimum: '0.1.0' }),
    loadAndListComponents: vi.fn().mockResolvedValue(
      components.map((c) => ({
        id: c.id,
        title: c.id,
        kind: 'service',
        links: c.links,
        tags: [],
      }))
    ),
  };
}

describe('findRepositoryLink via runValidate', () => {
  it('should match legitimate github.com URLs', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['https://github.com/owner/repo'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(1);
    expect(result.unlinked).toBe(0);
  });

  it('should match legitimate gitlab.com URLs', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['https://gitlab.com/group/project'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(1);
  });

  it('should reject spoofed URLs like evil-github.com', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['https://evil-github.com/owner/repo'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(0);
    expect(result.unlinked).toBe(1);
  });

  it('should reject URLs with github.com in query string', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['https://evil.com?redirect=github.com'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(0);
    expect(result.unlinked).toBe(1);
  });

  it('should match legitimate bitbucket.org URLs', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['https://bitbucket.org/team/repo'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(1);
  });

  it('should reject spoofed bitbucket URLs', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['https://evil-bitbucket.org/team/repo'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(0);
    expect(result.unlinked).toBe(1);
  });

  it('should reject non-http/https protocols', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['javascript:alert(1)//github.com/owner/repo'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(0);
    expect(result.unlinked).toBe(1);
  });

  it('should reject URLs with gitlab.com as subdomain prefix', async () => {
    const mockAdapter = makeMockAdapter([
      { id: 'service_a', links: ['https://evil-gitlab.com/group/project'] },
    ]);
    vi.mocked(createAdapter).mockReturnValue(mockAdapter as never);

    const result = await runValidate({ modelPath: '/fake' });

    expect(result.linked).toBe(0);
    expect(result.unlinked).toBe(1);
  });
});
