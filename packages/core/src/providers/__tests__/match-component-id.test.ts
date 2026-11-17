import { describe, it, expect } from 'vitest';
import { matchComponentId } from '../base-provider.js';

describe('matchComponentId', () => {
  const ids = ['api', 'api-gateway', 'system.web'];

  it('prefers the exact id over a shorter prefix id', () => {
    expect(matchComponentId('api-gateway', ids)).toBe('api-gateway');
  });

  it('strips whitespace, backticks and quotes', () => {
    expect(matchComponentId(' `api-gateway`\n', ids)).toBe('api-gateway');
    expect(matchComponentId('"api"', ids)).toBe('api');
  });

  it('finds a whole-token id inside prose', () => {
    expect(matchComponentId('The component is api-gateway.', ids)).toBe('api-gateway');
    expect(matchComponentId('I think system.web, not api', ids)).toBe('system.web');
  });

  it('prefers the earliest match over a longer id mentioned later', () => {
    expect(matchComponentId('api. api-gateway is not affected', ids)).toBe('api');
    expect(matchComponentId('api-gateway, not api', ids)).toBe('api-gateway');
  });

  it('does not match inside a longer token', () => {
    expect(matchComponentId('api-gateway-v2', ids)).toBeNull();
    expect(matchComponentId('myapi', ids)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchComponentId('unknown', ids)).toBeNull();
  });
});
