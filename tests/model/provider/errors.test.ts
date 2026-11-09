import { describe, expect, test } from 'bun:test';
import { SSEError, TimeoutError } from '../../../src/model/provider/errors.ts';
import { OpenAIError } from '../../../src/model/provider/openai/errors.ts';

describe('provider errors', () => {
  test('TimeoutError preserves its message and name', () => {
    const error = new TimeoutError('timed out');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TimeoutError');
    expect(error.message).toBe('timed out');
  });

  test('SSEError preserves its message and name', () => {
    const error = new SSEError('bad stream');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SSEError');
    expect(error.message).toBe('bad stream');
  });

  test('OpenAIError carries code and cause when provided', () => {
    const cause = new Error('root cause');
    const error = new OpenAIError('request failed', {
      code: 'invalid_request',
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OpenAIError');
    expect(error.message).toBe('request failed');
    expect(error.code).toBe('invalid_request');
    expect(error.cause).toBe(cause);
  });

  test('OpenAIError leaves code undefined by default', () => {
    const error = new OpenAIError('request failed');

    expect(error.code).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });
});
