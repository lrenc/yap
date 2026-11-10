import { describe, expect, test } from 'bun:test';
import { summarize } from '../../../src/context/compaction/summary.ts';
import type {
  OpenAIResponse,
  ResponseCreateParams,
  ResponseInputItem,
} from '../../../src/model/provider/openai/types.ts';
import { clientWithCreate, textResponse } from '../helpers.ts';

const user: ResponseInputItem = {
  role: 'user',
  content: 'source message',
};

const reasoning: ResponseInputItem = {
  type: 'reasoning',
  id: 'reasoning_1',
  summary: [{ type: 'summary_text', text: 'private reasoning' }],
};

describe('summarize', () => {
  test('requests a stored-off summary and filters reasoning items', async () => {
    let request!: ResponseCreateParams;
    const client = clientWithCreate(async params => {
      request = params;
      return textResponse('summary', ' Consolidated summary ');
    });

    const result = await summarize({
      client,
      modelId: 'test-model',
      contextWindow: 128_000,
      prefix: [user, reasoning],
      maxSummaryTokens: 4_096,
      margin: 8_192,
      signal: new AbortController().signal,
    });

    expect(result).toBe('Consolidated summary');
    expect(request.model).toBe('test-model');
    expect(request.store).toBe(false);
    expect(request.max_output_tokens).toBe(4_096);
    const input = JSON.parse(String(request.input)) as {
      messages: ResponseInputItem[];
    };
    expect(input.messages).toEqual([user]);
  });

  test('rejects empty source material without calling the client', async () => {
    let called = false;
    const client = clientWithCreate(async () => {
      called = true;
      return textResponse();
    });

    await expect(summarize({
      client,
      modelId: 'test-model',
      contextWindow: 128_000,
      prefix: [],
      maxSummaryTokens: 4_096,
      margin: 8_192,
      signal: new AbortController().signal,
    })).rejects.toThrow('No content to summarize');

    expect(called).toBe(false);
  });

  test('rejects a non-completed response', async () => {
    const client = clientWithCreate(async () => textResponse(
      'failed',
      'ignored',
      'failed',
    ));

    await expect(summarize({
      client,
      modelId: 'test-model',
      contextWindow: 128_000,
      prefix: [user],
      maxSummaryTokens: 4_096,
      margin: 8_192,
      signal: new AbortController().signal,
    })).rejects.toThrow('Summary failed: failed');
  });

  test('rejects tool calls and refusals in the summary', async () => {
    const toolCall: OpenAIResponse = {
      id: 'tool',
      status: 'completed',
      output: [{
        type: 'function_call',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{}',
      }],
    };
    const toolClient = clientWithCreate(async () => toolCall);
    await expect(summarize({
      client: toolClient,
      modelId: 'test-model',
      contextWindow: 128_000,
      prefix: [user],
      maxSummaryTokens: 4_096,
      margin: 8_192,
      signal: new AbortController().signal,
    })).rejects.toThrow('Summary must not contain tool calls');

    const refusal: OpenAIResponse = {
      id: 'refusal',
      status: 'completed',
      output: [{
        type: 'message',
        id: 'message_refusal',
        role: 'assistant',
        content: [{ type: 'refusal', refusal: 'not allowed' }],
      }],
    };
    const refusalClient = clientWithCreate(async () => refusal);
    await expect(summarize({
      client: refusalClient,
      modelId: 'test-model',
      contextWindow: 128_000,
      prefix: [user],
      maxSummaryTokens: 4_096,
      margin: 8_192,
      signal: new AbortController().signal,
    })).rejects.toThrow('Summary refused: not allowed');
  });

  test('rejects an empty summary response', async () => {
    const client = clientWithCreate(async () => ({
      id: 'empty',
      status: 'completed',
      output: [],
    }));

    await expect(summarize({
      client,
      modelId: 'test-model',
      contextWindow: 128_000,
      prefix: [user],
      maxSummaryTokens: 4_096,
      margin: 8_192,
      signal: new AbortController().signal,
    })).rejects.toThrow('Summary must not be empty');
  });

  test('checks the budget before calling the client', async () => {
    let called = false;
    const client = clientWithCreate(async () => {
      called = true;
      return textResponse();
    });

    await expect(summarize({
      client,
      modelId: 'test-model',
      contextWindow: 10,
      prefix: [user],
      maxSummaryTokens: 4_096,
      margin: 0,
      signal: new AbortController().signal,
    })).rejects.toThrow('Summary input exceeds the context budget');

    expect(called).toBe(false);
  });

  test('does not call the client after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const client = clientWithCreate(async () => {
      called = true;
      return textResponse();
    });

    await expect(summarize({
      client,
      modelId: 'test-model',
      contextWindow: 128_000,
      prefix: [user],
      maxSummaryTokens: 4_096,
      margin: 8_192,
      signal: controller.signal,
    })).rejects.toThrow();

    expect(called).toBe(false);
  });
});
