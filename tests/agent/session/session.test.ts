import { describe, expect, test } from 'bun:test';
import { Session } from '../../../src/agent/session/session.ts';
import type {
  SessionOptions,
} from '../../../src/agent/session/types.ts';
import type {
  AgentEvent,
  AgentResult,
} from '../../../src/agent/run/types.ts';
import type { AgentConfig } from '../../../src/agent/types.ts';
import type {
  OpenAIClient,
  OpenAIResponse,
  RequestOptions,
  ResponseCreateParams,
  ResponseStreamEvent,
} from '../../../src/model/provider/openai/types.ts';
import type { AgentModel } from '../../../src/model/types.ts';

function response(id: string, text: string): OpenAIResponse {
  return {
    id,
    status: 'completed',
    output: [{
      type: 'message',
      id: `message_${id}`,
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    }],
  };
}

function immediateClient(): OpenAIClient {
  let count = 0;
  return {
    endpoint: 'https://example.test/v1/responses',
    async create() {
      count += 1;
      return response(`response_${count}`, `reply ${count}`);
    },
    async stream(): Promise<AsyncGenerator<ResponseStreamEvent>> {
      return (async function* events(): AsyncGenerator<ResponseStreamEvent> {
        yield {
          type: 'response.output_text.delta',
          item_id: 'message_1',
          output_index: 0,
          delta: 'streamed',
        };
        yield {
          type: 'response.completed',
          response: response('streamed', 'streamed'),
        };
      })();
    },
  };
}

function createSession(
  client: OpenAIClient,
  options: Partial<SessionOptions> = {},
  contextWindow = 128_000,
): Session {
  const model: AgentModel = {
    id: 'test-model',
    client,
    contextWindow,
    params: {
      max_output_tokens: 1_024,
    },
  };
  const agent: AgentConfig = {
    instructions: 'Be concise',
    models: [model],
    tools: [],
  };
  return new Session(agent, {
    getModelSelection: () => ({ modelId: 'test-model' }),
    ...options,
  });
}

async function collect(
  stream: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Condition was not met');
}

interface PendingRequest {
  params: ResponseCreateParams;
  options: RequestOptions | undefined;
  resolve: (response: OpenAIResponse) => void;
}

function controlledClient(): {
  client: OpenAIClient;
  pending: PendingRequest[];
  resolveNext: (text: string) => void;
} {
  const pending: PendingRequest[] = [];
  let nextId = 0;
  const client: OpenAIClient = {
    endpoint: 'https://example.test/v1/responses',
    create(params, options) {
      return new Promise((resolve, reject) => {
        const item: PendingRequest = {
          params,
          options,
          resolve,
        };
        pending.push(item);
        options?.signal?.addEventListener('abort', () => {
          const index = pending.indexOf(item);
          if (index >= 0) {
            pending.splice(index, 1);
          }
          reject(options.signal?.reason);
        }, { once: true });
      });
    },
    async stream() {
      throw new Error('stream is not used');
    },
  };

  return {
    client,
    pending,
    resolveNext(text) {
      const item = pending.shift();
      if (!item) {
        throw new Error('No pending request');
      }
      nextId += 1;
      item.resolve(response(`controlled_${nextId}`, text));
    },
  };
}

describe('Session', () => {
  test('runs one message and resolves the final result', async () => {
    const session = createSession(immediateClient());

    const result = await session.run('hello');

    expect(result.stopReason).toBe('completed');
    expect(result.turns).toBe(1);
    expect(result.response?.id).toBe('response_1');
  });

  test('streams events through runStream', async () => {
    const session = createSession(immediateClient());

    const events = await collect(session.runStream('hello'));

    expect(events.map(event => event.type)).toContain('text_delta');
    expect(events.at(-1)?.type).toBe('done');
  });

  test('rejects empty messages', () => {
    const session = createSession(immediateClient());

    expect(() => session.run('   ')).toThrow('Message must not be empty');
  });

  test('rejects pending input beyond the context budget', () => {
    const session = createSession(
      immediateClient(),
      {},
      30_000,
    );

    expect(() => session.run('x'.repeat(40_000)))
      .toThrow('Pending input exceeds the context budget');
  });

  test('returns a cancelled result when the signal is already aborted', async () => {
    const controlled = controlledClient();
    const session = createSession(controlled.client);
    const controller = new AbortController();
    controller.abort();

    const result = await session.run('hello', {
      signal: controller.signal,
    });

    expect(result.stopReason).toBe('cancelled');
    expect(result.turns).toBe(0);
    expect(controlled.pending).toHaveLength(0);
  });

  test('closes an already-aborted stream with done', async () => {
    const controlled = controlledClient();
    const session = createSession(controlled.client);
    const controller = new AbortController();
    controller.abort();

    const events = await collect(session.runStream('hello', {
      signal: controller.signal,
    }));

    expect(events.map(event => event.type)).toEqual(['done']);
    expect(controlled.pending).toHaveLength(0);
  });

  test('waits until the selected model is ready', async () => {
    let ready = false;
    const session = createSession(immediateClient(), {
      isReady: () => ready,
    });
    const result = session.run('hello');
    await waitFor(() => session.waiting !== null);

    expect(session.waiting).toEqual({
      modelId: 'test-model',
      count: 1,
    });

    ready = true;
    session.resume();
    expect((await result).stopReason).toBe('completed');
    expect(session.waiting).toBeNull();
  });

  test('cancels a waiting run', async () => {
    const session = createSession(immediateClient(), {
      isReady: () => false,
    });
    const result = session.run('hello');
    await waitFor(() => session.waiting !== null);

    session.cancel();

    expect((await result).stopReason).toBe('cancelled');
    expect(session.waiting).toBeNull();
  });

  test('reports the number of waiting runs', async () => {
    const session = createSession(immediateClient(), {
      isReady: () => false,
    });
    const first = session.run('first');
    const second = session.run('second');
    await waitFor(() => session.waiting?.count === 2);

    expect(session.waiting).toEqual({
      modelId: 'test-model',
      count: 2,
    });

    session.cancel();
    expect((await first).stopReason).toBe('cancelled');
    expect((await second).stopReason).toBe('cancelled');
  });

  test('rejects a waiting run when model selection fails', async () => {
    let unavailable = false;
    const session = createSession(immediateClient(), {
      getModelSelection: () => {
        if (unavailable) {
          throw new Error('model unavailable');
        }
        return { modelId: 'test-model' };
      },
      isReady: () => false,
    });
    const result = session.run('hello');
    await waitFor(() => session.waiting !== null);

    unavailable = true;
    session.resume();

    expect(await result).toMatchObject({
      stopReason: 'error',
      error: new Error('model unavailable'),
    });
    expect(session.waiting).toBeNull();
  });

  test('cancels the active model request', async () => {
    const controlled = controlledClient();
    const session = createSession(controlled.client);
    const result = session.run('hello');
    await waitFor(() => controlled.pending.length === 1);

    session.cancel();

    expect((await result).stopReason).toBe('cancelled');
  });

  test('removes an admitted queued run when cancelled', async () => {
    const controlled = controlledClient();
    const session = createSession(controlled.client);
    const first = session.run('first');
    await waitFor(() => controlled.pending.length === 1);

    const second = session.run('second');
    session.cancel();

    expect((await first).stopReason).toBe('cancelled');
    expect((await second).stopReason).toBe('cancelled');

    const third = session.run('third');
    await waitFor(() => controlled.pending.length === 1);
    expect(JSON.stringify(controlled.pending[0]?.params.input))
      .toContain('first');
    expect(JSON.stringify(controlled.pending[0]?.params.input))
      .toContain('third');
    expect(JSON.stringify(controlled.pending[0]?.params.input))
      .not.toContain('second');

    controlled.resolveNext('third reply');
    expect((await third).stopReason).toBe('completed');
  });

  test('interrupts the active run when a new message is queued', async () => {
    const controlled = controlledClient();
    const session = createSession(controlled.client);
    const first = session.run('first');
    await waitFor(() => controlled.pending.length === 1);

    const second = session.run('second');
    await waitFor(() => controlled.pending.length === 1);
    controlled.resolveNext('second reply');

    expect((await first).stopReason).toBe('interrupted');
    expect((await second).stopReason).toBe('completed');
    expect(controlled.pending).toHaveLength(0);
  });

  test('keeps a run completed when the next message follows text_done', async () => {
    const session = createSession(immediateClient());
    let second: Promise<AgentResult> | undefined;
    let firstDone: AgentEvent & { type: 'done' } | undefined;

    for await (const event of session.runStream('first')) {
      if (event.type === 'text_done') {
        second = session.run('second');
      }
      if (event.type === 'done') {
        firstDone = event;
      }
    }

    expect(firstDone?.result.stopReason).toBe('completed');
    expect((await second)?.stopReason).toBe('completed');
  });
});
