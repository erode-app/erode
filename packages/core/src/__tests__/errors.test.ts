import { describe, it, expect } from 'vitest';
import { ApiError } from '../errors.js';

function geminiError(message: string, status?: number): Error {
  const err = new Error(message);
  if (status !== undefined) Object.assign(err, { status });
  return err;
}

describe('ApiError.fromGeminiError', () => {
  it('prefers the structured status over the message', () => {
    const err = ApiError.fromGeminiError(geminiError('gemini-2.0-flash-001 failed 503', 429));
    expect(err.statusCode).toBe(429);
  });

  it('does not read digits from a model name', () => {
    const err = ApiError.fromGeminiError(geminiError('Model gemini-2.0-flash-001 is unavailable'));
    expect(err.statusCode).toBeUndefined();
  });

  it('does not read digits from a token count', () => {
    const err = ApiError.fromGeminiError(geminiError('Input exceeds 100000 tokens'));
    expect(err.statusCode).toBeUndefined();
  });

  it.each([
    ['got status: 429. {"error":{}}', 429],
    ['[503 Service Unavailable] try later', 503],
    ['{"error":{"code":429,"message":"quota","status":"RESOURCE_EXHAUSTED"}}', 429],
  ])('falls back to a status-looking pattern in "%s"', (message, expected) => {
    expect(ApiError.fromGeminiError(geminiError(message)).statusCode).toBe(expected);
  });

  it.each([
    ['429 Too Many Requests', 429],
    ['Request failed: 503 Service Unavailable', 503],
    ['  500 Internal Server Error', 500],
    ['RESOURCE_EXHAUSTED (429) quota', 429],
    ['The model is UNAVAILABLE right now', 503],
    ['DEADLINE_EXCEEDED while waiting', 504],
    ['[429 Too Many Requests] slow down', 429],
  ])('maps the explicit form "%s" to %i', (message, expected) => {
    expect(ApiError.fromGeminiError(geminiError(message)).statusCode).toBe(expected);
  });

  it.each(['[429, 500] values', '[500 tokens truncated]', 'sent 500 tokens in total'])(
    'does not read a status from "%s"',
    (message) => {
      expect(ApiError.fromGeminiError(geminiError(message)).statusCode).toBeUndefined();
    }
  );

  it('classifies a 429 with a misleading model name as rate limited', () => {
    const err = ApiError.fromGeminiError(
      geminiError('gemini-2.0-flash-001 quota hit, got status: 429.')
    );
    expect(err.statusCode).toBe(429);
  });
});
