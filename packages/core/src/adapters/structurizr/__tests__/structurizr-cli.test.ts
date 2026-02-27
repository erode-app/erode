import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';
import { exportDslToJson } from '../structurizr-cli.js';
import { AdapterError, ErrorCode } from '../../../errors.js';
import { CONFIG } from '../../../utils/config.js';

const mockExecFile = vi.mocked(execFile);

describe('exportDslToJson', () => {
  let originalCliPath: string | undefined;

  beforeEach(() => {
    mockExecFile.mockReset();
    originalCliPath = CONFIG.adapter.structurizr.cliPath;
  });

  afterEach(() => {
    CONFIG.adapter.structurizr.cliPath = originalCliPath;
  });

  it('should throw AdapterError when Java is not found (ENOENT)', async () => {
    CONFIG.adapter.structurizr.cliPath = '/opt/structurizr.war';

    const enoentError = new Error('spawn java ENOENT') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';

    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(enoentError);
      return {} as ReturnType<typeof execFile>;
    });

    try {
      await exportDslToJson('/test/workspace.dsl');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.code).toBe(ErrorCode.MODEL_LOAD_ERROR);
      expect(adapterError.suggestions).toBeDefined();
      expect(adapterError.suggestions?.some((s) => s.includes('STRUCTURIZR_CLI_PATH'))).toBe(true);
    }
  });

  it('should throw AdapterError when Docker is not found (ENOENT)', async () => {
    CONFIG.adapter.structurizr.cliPath = undefined;

    const enoentError = new Error('spawn docker ENOENT') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';

    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(enoentError);
      return {} as ReturnType<typeof execFile>;
    });

    try {
      await exportDslToJson('/test/workspace.dsl');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).code).toBe(ErrorCode.MODEL_LOAD_ERROR);
    }
  });

  it('should use Java WAR when CLI path is configured', async () => {
    CONFIG.adapter.structurizr.cliPath = '/opt/structurizr.war';

    const exitError = new Error('exit code 1');
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(exitError);
      return {} as ReturnType<typeof execFile>;
    });

    await expect(exportDslToJson('/test/workspace.dsl')).rejects.toThrow();

    expect(mockExecFile).toHaveBeenCalledWith(
      'java',
      expect.arrayContaining(['-jar', '/opt/structurizr.war', 'export']),
      expect.any(Function)
    );
  });

  it('should fall back to Docker when no CLI path is configured', async () => {
    CONFIG.adapter.structurizr.cliPath = undefined;

    const exitError = new Error('exit code 1');
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(exitError);
      return {} as ReturnType<typeof execFile>;
    });

    await expect(exportDslToJson('/test/workspace.dsl')).rejects.toThrow();

    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['run', '--rm', 'structurizr/structurizr:2026.02.01', 'export']),
      expect.any(Function)
    );
  });
});
