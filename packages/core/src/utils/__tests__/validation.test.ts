import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { validatePath, validate } from '../validation.js';
import { ErodeError, ErrorCode } from '../../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('validatePath', () => {
  it('throws on empty path', () => {
    expect(() => {
      validatePath('');
    }).toThrow(ErodeError);
    expect(() => {
      validatePath('');
    }).toThrow('Path argument is required');
  });

  it('throws with INPUT_INVALID code on empty path', () => {
    try {
      validatePath('');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      expect((error as ErodeError).code).toBe(ErrorCode.INPUT_INVALID);
    }
  });

  it('succeeds for an existing directory', () => {
    expect(() => {
      validatePath(__dirname, 'directory');
    }).not.toThrow();
  });

  it('succeeds for an existing file', () => {
    expect(() => {
      validatePath(__filename, 'file');
    }).not.toThrow();
  });

  it('defaults to directory type', () => {
    expect(() => {
      validatePath(__dirname);
    }).not.toThrow();
  });

  it('throws IO_DIR_NOT_FOUND for a nonexistent directory', () => {
    const fakePath = join(__dirname, 'nonexistent-dir-abc123');
    try {
      validatePath(fakePath, 'directory');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      const erodeErr = error as ErodeError;
      expect(erodeErr.code).toBe(ErrorCode.IO_DIR_NOT_FOUND);
      expect(erodeErr.message).toContain('Directory is not accessible');
    }
  });

  it('throws IO_FILE_NOT_FOUND for a nonexistent file', () => {
    const fakePath = join(__dirname, 'nonexistent-file-abc123.ts');
    try {
      validatePath(fakePath, 'file');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      const erodeErr = error as ErodeError;
      expect(erodeErr.code).toBe(ErrorCode.IO_FILE_NOT_FOUND);
      expect(erodeErr.message).toContain('File is not accessible');
    }
  });

  it('throws when path is a file but type is directory', () => {
    try {
      validatePath(__filename, 'directory');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      const erodeErr = error as ErodeError;
      expect(erodeErr.code).toBe(ErrorCode.IO_DIR_NOT_FOUND);
    }
  });

  it('throws when path is a directory but type is file', () => {
    try {
      validatePath(__dirname, 'file');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      const erodeErr = error as ErodeError;
      expect(erodeErr.code).toBe(ErrorCode.IO_FILE_NOT_FOUND);
    }
  });

  it('includes path and type in error context', () => {
    const fakePath = join(__dirname, 'nope');
    try {
      validatePath(fakePath, 'directory');
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.context['path']).toBe(fakePath);
      expect(erodeErr.context['type']).toBe('directory');
    }
  });
});

describe('validate', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it('returns parsed data for valid input', () => {
    const result = validate(schema, { name: 'Alice', age: 30 });
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('strips unknown keys', () => {
    const result = validate(schema, { name: 'Bob', age: 25, extra: true });
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });

  it('throws ErodeError on validation failure', () => {
    expect(() => validate(schema, {})).toThrow(ErodeError);
  });

  it('includes fieldName in error message when provided', () => {
    try {
      validate(schema, {}, 'user');
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.message).toContain('for user');
    }
  });

  it('formats issues as a numbered list', () => {
    try {
      validate(schema, {});
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.message).toContain('1.');
      expect(erodeErr.message).toContain('[name]');
    }
  });

  it('uses (root) for top-level schema errors', () => {
    try {
      validate(z.string(), 42);
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.message).toContain('(root)');
    }
  });

  it('uses INPUT_INVALID error code', () => {
    try {
      validate(schema, {});
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.code).toBe(ErrorCode.INPUT_INVALID);
    }
  });

  it('includes issue count in userMessage', () => {
    try {
      validate(schema, {});
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.userMessage).toContain('issue(s) found');
    }
  });

  it('includes field in context', () => {
    try {
      validate(schema, {}, 'config');
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.context['field']).toBe('config');
    }
  });

  it('works without fieldName', () => {
    try {
      validate(schema, {});
      expect.fail('should have thrown');
    } catch (error) {
      const erodeErr = error as ErodeError;
      expect(erodeErr.message).toContain('Validation failed');
      expect(erodeErr.message).not.toContain('for ');
    }
  });
});
