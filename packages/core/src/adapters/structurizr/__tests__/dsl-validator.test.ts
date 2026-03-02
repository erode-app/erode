import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../structurizr-cli.js', () => ({
  exportDslToJson: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/erode-structurizr-validate-abc'),
  cp: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { exportDslToJson } from '../structurizr-cli.js';
import { validateStructurizrDsl } from '../dsl-validator.js';

const mockExportDslToJson = vi.mocked(exportDslToJson);

describe('validateStructurizrDsl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid when CLI export succeeds', async () => {
    mockExportDslToJson.mockResolvedValue({});

    const result = await validateStructurizrDsl(
      '/workspace',
      '/workspace/workspace.dsl',
      'workspace {}'
    );

    expect(result).toEqual({ valid: true });
  });

  it('should return invalid with errors when CLI export fails', async () => {
    mockExportDslToJson.mockRejectedValue(new Error('Invalid DSL syntax'));

    const result = await validateStructurizrDsl(
      '/workspace',
      '/workspace/workspace.dsl',
      'bad content'
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid DSL syntax');
  });

  it('should return skipped when CLI is not found (ENOENT)', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    mockExportDslToJson.mockRejectedValue(enoent);

    const result = await validateStructurizrDsl(
      '/workspace',
      '/workspace/workspace.dsl',
      'workspace {}'
    );

    expect(result.valid).toBe(false);
    expect(result.skipped).toBe(true);
  });
});
