import { describe, expect, test } from 'bun:test';
import { calibrateTokens } from '../../src/context/calibration.ts';
import { estimateEntry } from '../../src/context/tokens.ts';
import type {
  HistoryEntry,
  RequestInfo,
} from '../../src/context/types.ts';
import type { ResponseUsage } from '../../src/model/provider/openai/types.ts';
import { requestInfo, textResponse } from './helpers.ts';

function responseEntry(
  id: string,
  request: RequestInfo,
  usage: ResponseUsage | null,
): HistoryEntry {
  const response = textResponse(id);
  return {
    type: 'response',
    responseId: response.id,
    output: response.output,
    request,
    usage,
  };
}

const user = (content: string): HistoryEntry => ({
  type: 'user',
  message: { role: 'user', content },
});

describe('calibrateTokens', () => {
  test('uses the latest compatible total and estimates later entries', () => {
    const request = requestInfo();
    const tail = user('tail');
    const history = [
      responseEntry('baseline', request, {
        input_tokens: 80,
        output_tokens: 20,
        total_tokens: 100,
      }),
      tail,
    ];

    expect(calibrateTokens({
      history,
      contextStart: 0,
      request,
    })).toBe(100 + estimateEntry(tail));
  });

  test('falls back to input and output tokens', () => {
    const request = requestInfo();
    const usage = {
      input_tokens: 30,
      output_tokens: 12,
    } as ResponseUsage;

    expect(calibrateTokens({
      history: [responseEntry('baseline', request, usage)],
      contextStart: 0,
      request,
    })).toBe(42);
  });

  test('skips incompatible responses and uses an older compatible baseline', () => {
    const request = requestInfo();
    const incompatible = responseEntry('middle', requestInfo({
      signature: 'other',
    }), {
      input_tokens: 100,
      output_tokens: 100,
      total_tokens: 200,
    });
    const tail = user('tail');
    const history = [
      responseEntry('baseline', request, {
        input_tokens: 20,
        output_tokens: 10,
        total_tokens: 30,
      }),
      incompatible,
      tail,
    ];

    expect(calibrateTokens({
      history,
      contextStart: 0,
      request,
    })).toBe(
      30
      + estimateEntry(incompatible)
      + estimateEntry(tail),
    );
  });

  test('returns undefined for invalid usage', () => {
    const request = requestInfo();
    const usage = {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: -1,
    } as ResponseUsage;

    expect(calibrateTokens({
      history: [responseEntry('invalid', request, usage)],
      contextStart: 0,
      request,
    })).toBeUndefined();
  });

  test('does not calibrate without an endpoint', () => {
    const request = requestInfo();
    delete request.endpoint;

    expect(calibrateTokens({
      history: [],
      contextStart: 0,
      request,
    })).toBeUndefined();
  });

  test.each([
    ['extra input', requestInfo({ hasExtraInput: true })],
    ['different context start', requestInfo({ contextStart: 1 })],
  ])('does not calibrate with %s', (_name, request) => {
    expect(calibrateTokens({
      history: [],
      contextStart: 0,
      request,
    })).toBeUndefined();
  });
});
