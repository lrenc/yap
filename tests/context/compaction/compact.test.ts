import { describe, expect, test } from 'bun:test';
import { Context } from '../../../src/context/context.ts';
import { compact } from '../../../src/context/compaction/compact.ts';
import type { CompactionBudget } from '../../../src/context/types.ts';
import { estimateTokens } from '../../../src/context/tokens.ts';
import {
  buildRequest,
  clientWithCreate,
  textResponse,
} from '../helpers.ts';

const budget: CompactionBudget = {
  reserveTokens: 16_384,
  keepRecentTokens: 0,
  maxSummaryTokens: 4_096,
  threshold: 100_000,
  margin: 0,
};

function contextWithTurns(): Context {
  const context = new Context();
  context.addUserMessage('old user');
  context.addResponse(textResponse('old', 'old response '.repeat(100)));
  context.addUserMessage('pending user');
  return context;
}

describe('compact', () => {
  test('returns an error result when planning fails', async () => {
    const result = await compact({
      context: new Context(),
      budget,
      client: clientWithCreate(async () => textResponse()),
      modelId: 'test-model',
      contextWindow: 128_000,
      signal: new AbortController().signal,
      buildRequest,
    });

    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.error).toBeInstanceOf(Error);
  });

  test('commits a successful compaction', async () => {
    const context = contextWithTurns();
    const result = await compact({
      context,
      budget,
      client: clientWithCreate(async () => textResponse(
        'summary',
        'short summary',
      )),
      modelId: 'test-model',
      contextWindow: 128_000,
      signal: new AbortController().signal,
      buildRequest,
    });

    expect(result).toEqual({ status: 'completed' });
    expect(context.contextStart).toBe(2);
    const input = context.toInput();
    expect(input).toHaveLength(3);
    expect(input[0]).toMatchObject({ role: 'developer' });
    expect(input[1]).toEqual({
      role: 'user',
      content: 'short summary',
    });
    expect(input[2]).toEqual({
      role: 'user',
      content: 'pending user',
    });
  });

  test('reserves budget for escaped summary content', async () => {
    const context = new Context();
    context.addUserMessage('old user 1');
    context.addResponse(textResponse('old-1', 'old response '.repeat(40)));
    context.addUserMessage('old user 2');
    context.addResponse(textResponse('old-2', 'recent'));
    context.addUserMessage('pending user');
    const summary = `C:${'\\a'.repeat(14)}`;
    const result = await compact({
      context,
      budget: {
        reserveTokens: 0,
        keepRecentTokens: 30,
        maxSummaryTokens: 10,
        threshold: 230,
        margin: 0,
      },
      client: clientWithCreate(async () => textResponse(
        'summary',
        summary,
      )),
      modelId: 'test-model',
      contextWindow: 128_000,
      signal: new AbortController().signal,
      buildRequest,
    });

    expect(result).toEqual({ status: 'completed' });
    expect(context.contextStart).toBeGreaterThan(0);
    expect(context.toInput()[1]).toEqual({
      role: 'user',
      content: summary,
    });
  });

  test('reserves the latest tool response and output', async () => {
    const context = new Context();
    const call = {
      type: 'function_call' as const,
      id: 'call-item',
      call_id: 'call-1',
      name: 'read',
      arguments: '{}',
    };
    context.addUserMessage('old user');
    context.addResponse(textResponse('old', 'o'.repeat(20_000)));
    context.addUserMessage('use the tool');
    context.addResponse({
      id: 'tool-response',
      status: 'completed',
      output: [call],
    });
    context.addToolResult(call, 'x'.repeat(20_000));
    const budget: CompactionBudget = {
      reserveTokens: 0,
      keepRecentTokens: 20_000,
      maxSummaryTokens: 4_096,
      threshold: 13_616,
      margin: 0,
    };

    const result = await compact({
      context,
      budget,
      client: clientWithCreate(async () => textResponse(
        'summary',
        'short summary',
      )),
      modelId: 'test-model',
      contextWindow: 30_000,
      signal: new AbortController().signal,
      buildRequest,
    });

    expect(result).toEqual({ status: 'completed' });
    expect(context.requiredInput()).toHaveLength(2);
    expect(estimateTokens(buildRequest(context.toInput())))
      .toBeLessThanOrEqual(budget.threshold);
  });

  test('does not commit when the summary is too large', async () => {
    const context = contextWithTurns();
    const result = await compact({
      context,
      budget,
      client: clientWithCreate(async () => textResponse(
        'summary',
        'x'.repeat(budget.maxSummaryTokens * 4),
      )),
      modelId: 'test-model',
      contextWindow: 128_000,
      signal: new AbortController().signal,
      buildRequest,
    });

    expect(result.status).toBe('error');
    expect(context.contextStart).toBe(0);
  });

  test('does not commit when compacted input does not shrink', async () => {
    const context = new Context();
    context.addUserMessage('a');
    context.addResponse(textResponse('small', 'b'));
    context.addUserMessage('c');
    const result = await compact({
      context,
      budget,
      client: clientWithCreate(async () => textResponse(
        'summary',
        'x'.repeat(3_000),
      )),
      modelId: 'test-model',
      contextWindow: 128_000,
      signal: new AbortController().signal,
      buildRequest,
    });

    expect(result.status).toBe('error');
    expect(
      result.status === 'error' ? result.error : undefined,
    ).toHaveProperty('message', 'Compacted input must shrink and fit the budget');
    expect(context.contextStart).toBe(0);
  });

  test('returns an error when summary generation fails', async () => {
    const context = contextWithTurns();
    const result = await compact({
      context,
      budget,
      client: clientWithCreate(async () => {
        throw new Error('network');
      }),
      modelId: 'test-model',
      contextWindow: 128_000,
      signal: new AbortController().signal,
      buildRequest,
    });

    expect(result.status).toBe('error');
    expect(context.contextStart).toBe(0);
  });

  test('returns cancelled after abort', async () => {
    const context = contextWithTurns();
    const controller = new AbortController();
    controller.abort();
    const result = await compact({
      context,
      budget,
      client: clientWithCreate(async () => textResponse()),
      modelId: 'test-model',
      contextWindow: 128_000,
      signal: controller.signal,
      buildRequest,
    });

    expect(result.status).toBe('cancelled');
    expect(context.contextStart).toBe(0);
  });
});
