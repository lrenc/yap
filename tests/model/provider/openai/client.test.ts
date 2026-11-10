import { describe, expect, test } from 'bun:test';
import { createClient } from '../../../../src/model/provider/openai/client.ts';
import { OpenAIError } from '../../../../src/model/provider/openai/errors.ts';
import type {
  OpenAIClient,
  OpenAIResponse,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseStreamEvent,
} from '../../../../src/model/provider/openai/types.ts';
import {
  byteStream,
  sseEvent,
  type TestStreamOptions,
} from '../../../helpers/streams.ts';

async function captureError(action: () => Promise<unknown>): Promise<Error> {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`Expected an Error, received ${String(error)}`);
  }
  throw new Error('Expected action to reject');
}

function messageItem(
  content: ResponseOutputMessage['content'] = [
    { type: 'output_text', text: 'hello' },
  ],
): ResponseOutputMessage {
  return {
    type: 'message',
    id: 'msg_1',
    role: 'assistant',
    content,
  };
}

function responseWith(
  status: OpenAIResponse['status'] = 'completed',
  output: ResponseOutputItem[] = [messageItem()],
): OpenAIResponse {
  return {
    id: 'resp_1',
    status,
    output,
  };
}

function jsonClient(payload: unknown, status = 200): OpenAIClient {
  return createClient({
    apiKey: 'test-key',
    baseURL: 'https://example.test/v1',
    fetch: async () => new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  });
}

function streamClient(
  events: readonly unknown[],
  options: TestStreamOptions = {},
): OpenAIClient {
  const body = byteStream(events.map(sseEvent), options);
  return createClient({
    apiKey: 'test-key',
    baseURL: 'https://example.test/v1',
    fetch: async () => new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
      },
    }),
  });
}

function rawStreamClient(
  chunks: readonly (string | Uint8Array)[],
  options: TestStreamOptions = {},
): OpenAIClient {
  const body = byteStream(chunks, options);
  return createClient({
    apiKey: 'test-key',
    baseURL: 'https://example.test/v1',
    fetch: async () => new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    }),
  });
}

async function collect(
  events: AsyncGenerator<ResponseStreamEvent>,
): Promise<ResponseStreamEvent[]> {
  const result: ResponseStreamEvent[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}

async function expectStreamFailure(
  events: readonly unknown[],
  message: string,
): Promise<void> {
  const stream = await streamClient(events).stream({
    model: 'test-model',
    input: 'hello',
  });
  await expect(collect(stream)).rejects.toThrow(message);
}

describe('createClient', () => {
  test('normalizes the base URL and exposes the responses endpoint', () => {
    const client = createClient({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1///',
    });

    expect(client.endpoint).toBe('https://example.test/v1/responses');
  });

  test('create sends an authenticated non-streaming request', async () => {
    let captured: Request | undefined;
    const payload = responseWith();
    const client = createClient({
      apiKey: 'secret',
      baseURL: 'https://example.test/v1/',
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const result = await client.create({
      model: 'test-model',
      input: 'hello',
      instructions: 'Be concise',
    });

    expect(result).toEqual(payload);
    expect(captured?.url).toBe('https://example.test/v1/responses');
    expect(captured?.headers.get('authorization')).toBe('Bearer secret');
    expect(captured?.headers.get('accept')).toBe('application/json');
    expect(captured?.headers.get('content-type')).toBe('application/json');
    expect(await captured?.json()).toEqual({
      model: 'test-model',
      input: 'hello',
      instructions: 'Be concise',
      stream: false,
    });
  });

  test('create returns incomplete and cancelled responses to the caller', async () => {
    for (const status of ['incomplete', 'cancelled'] as const) {
      const payload = responseWith(status, []);
      expect(await jsonClient(payload).create({
        model: 'test-model',
        input: 'hello',
      })).toEqual(payload);
    }
  });

  test('create throws the API error for a failed response', async () => {
    const client = jsonClient({
      id: 'resp_failed',
      status: 'failed',
      output: [],
      error: {
        code: 'invalid_prompt',
        message: 'Prompt rejected',
      },
    });

    const error = await captureError(() => client.create({
      model: 'test-model',
      input: 'hello',
    }));

    expect(error).toBeInstanceOf(OpenAIError);
    expect(error.message).toBe('Prompt rejected');
    expect((error as OpenAIError).code).toBe('invalid_prompt');
  });

  test('create uses a fallback message when a failed response has no error', async () => {
    const client = jsonClient({
      id: 'resp_failed',
      status: 'failed',
      output: [],
      error: null,
    });

    await expect(client.create({
      model: 'test-model',
      input: 'hello',
    })).rejects.toThrow('Responses request failed');
  });

  test('create rejects a response with an invalid top-level shape', async () => {
    const client = jsonClient({
      id: 'resp_1',
      status: 'unknown',
      output: [],
    });

    await expect(client.create({
      model: 'test-model',
      input: 'hello',
    })).rejects.toThrow('Invalid Responses response');
  });

  test('accepts all declared output item types', async () => {
    const payload = responseWith('completed', [
      messageItem([
        { type: 'output_text', text: 'hello' },
        { type: 'refusal', refusal: 'not allowed' },
      ]),
      {
        type: 'function_call',
        id: 'item_1',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{"id":1}',
      },
      {
        type: 'reasoning',
        id: 'reason_1',
        summary: [{ type: 'summary_text', text: 'summary' }],
        encrypted_content: null,
      },
    ]);

    expect(await jsonClient(payload).create({
      model: 'test-model',
      input: 'hello',
    })).toEqual(payload);
  });

  test('rejects duplicate function call IDs', async () => {
    const payload = responseWith('completed', [
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{}',
      },
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{}',
      },
    ]);

    await expect(jsonClient(payload).create({
      model: 'test-model',
      input: 'hello',
    })).rejects.toThrow('Duplicate Responses tool call: call_1');
  });

  const invalidItems: readonly {
    name: string;
    item: unknown;
  }[] = [
    {
      name: 'message without an ID',
      item: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'hello' }],
      },
    },
    {
      name: 'message with a non-assistant role',
      item: {
        type: 'message',
        id: 'msg_1',
        role: 'user',
        content: [{ type: 'output_text', text: 'hello' }],
      },
    },
    {
      name: 'message with an invalid content part',
      item: {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        content: [{ type: 'output_text', text: 1 }],
      },
    },
    {
      name: 'function call without a name',
      item: {
        type: 'function_call',
        call_id: 'call_1',
        arguments: '{}',
      },
    },
    {
      name: 'reasoning item with an invalid summary',
      item: {
        type: 'reasoning',
        id: 'reason_1',
        summary: [{ type: 'other', text: 'summary' }],
      },
    },
    {
      name: 'unknown output item',
      item: { type: 'web_search_call', id: 'item_1' },
    },
    {
      name: 'non-object output item',
      item: null,
    },
  ];

  for (const testCase of invalidItems) {
    test(`create rejects ${testCase.name}`, async () => {
      const payload = {
        id: 'resp_1',
        status: 'completed',
        output: [testCase.item],
      };

      await expect(jsonClient(payload).create({
        model: 'test-model',
        input: 'hello',
      })).rejects.toThrow();
    });
  }
});

describe('OpenAI Responses streaming', () => {
  test('stream sends an SSE request', async () => {
    let captured: Request | undefined;
    const payload = responseWith();
    const client = createClient({
      apiKey: 'secret',
      baseURL: 'https://example.test/v1',
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(byteStream([
          sseEvent({ type: 'response.completed', response: payload }),
        ]), {
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });

    await collect(await client.stream({
      model: 'test-model',
      input: 'hello',
    }));

    expect(captured?.headers.get('authorization')).toBe('Bearer secret');
    expect(captured?.headers.get('accept')).toBe('text/event-stream');
    expect(await captured?.json()).toEqual({
      model: 'test-model',
      input: 'hello',
      stream: true,
    });
  });

  test('parses every declared stream event and ignores unknown events', async () => {
    const completed = responseWith();
    const events = [
      { type: 'response.created', response: completed },
      {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: 0,
        delta: 'hel',
      },
      {
        type: 'response.output_text.done',
        item_id: 'msg_1',
        output_index: 0,
        text: 'hello',
      },
      {
        type: 'response.refusal.delta',
        item_id: 'msg_2',
        output_index: 1,
        delta: 'not ',
      },
      {
        type: 'response.refusal.done',
        item_id: 'msg_2',
        output_index: 1,
        refusal: 'not allowed',
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'call_1',
        output_index: 2,
        delta: '{"id":',
      },
      {
        type: 'response.function_call_arguments.done',
        item_id: 'call_1',
        output_index: 2,
        arguments: '{"id":1}',
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: messageItem(),
      },
      { type: 'response.completed', response: completed },
    ];

    const received = await collect(await streamClient(events).stream({
      model: 'test-model',
      input: 'hello',
    }));

    expect(received.map(event => event.type)).toEqual([
      'response.output_text.delta',
      'response.output_text.done',
      'response.refusal.delta',
      'response.refusal.done',
      'response.function_call_arguments.delta',
      'response.function_call_arguments.done',
      'response.output_item.done',
      'response.completed',
    ]);
  });

  test('accepts failed and incomplete terminal events', async () => {
    for (const status of ['failed', 'incomplete'] as const) {
      const completed = responseWith(status, []);
      const received = await collect(
        await streamClient([
          {
            type: `response.${status}`,
            response: completed,
          },
        ]).stream({
          model: 'test-model',
          input: 'hello',
        }),
      );

      expect(received).toEqual([
        {
          type: `response.${status}`,
          response: completed,
        },
      ]);
    }
  });

  test('stops reading after a terminal event', async () => {
    const completed = responseWith();
    const client = rawStreamClient([
      sseEvent({ type: 'response.completed', response: completed }),
      'data: {invalid json\n\n',
    ]);

    const received = await collect(await client.stream({
      model: 'test-model',
      input: 'hello',
    }));

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('response.completed');
  });

  test('rejects a stream that ends without a terminal event', async () => {
    await expectStreamFailure([
      {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: 0,
        delta: 'hello',
      },
    ], 'Responses stream has no terminal event');
  });

  test('rejects [DONE] without a Responses terminal event', async () => {
    const client = rawStreamClient(['data: [DONE]\n\n']);

    await expect(collect(await client.stream({
      model: 'test-model',
      input: 'hello',
    }))).rejects.toThrow('Responses stream has no terminal event');
  });

  test('rejects malformed event JSON', async () => {
    const client = rawStreamClient(['data: {broken\n\n']);

    await expect(collect(await client.stream({
      model: 'test-model',
      input: 'hello',
    }))).rejects.toThrow('Invalid Responses event JSON');
  });

  test('rejects an event without a string type', async () => {
    await expectStreamFailure([{}], 'Invalid Responses event');
  });

  test('throws provider error events with their code', async () => {
    const stream = await streamClient([
      {
        type: 'error',
        code: 'rate_limit',
        message: 'Try later',
      },
    ]).stream({
      model: 'test-model',
      input: 'hello',
    });

    const error = await captureError(() => collect(stream));

    expect(error).toBeInstanceOf(OpenAIError);
    expect(error.message).toBe('Responses error (rate_limit): Try later');
    expect((error as OpenAIError).code).toBe('rate_limit');
  });

  test('rejects a terminal event whose type and response status differ', async () => {
    await expectStreamFailure([
      {
        type: 'response.completed',
        response: responseWith('failed', []),
      },
    ], 'Responses event/status mismatch');
  });

  const invalidEvents: readonly {
    name: string;
    event: unknown;
  }[] = [
    {
      name: 'text delta without item_id',
      event: {
        type: 'response.output_text.delta',
        output_index: 0,
        delta: 'x',
      },
    },
    {
      name: 'text done with non-string text',
      event: {
        type: 'response.output_text.done',
        item_id: 'msg_1',
        output_index: 0,
        text: 1,
      },
    },
    {
      name: 'refusal delta without delta',
      event: {
        type: 'response.refusal.delta',
        item_id: 'msg_1',
        output_index: 0,
      },
    },
    {
      name: 'refusal done without refusal',
      event: {
        type: 'response.refusal.done',
        item_id: 'msg_1',
        output_index: 0,
      },
    },
    {
      name: 'function arguments delta without item_id',
      event: {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        delta: '{}',
      },
    },
    {
      name: 'function arguments done without arguments',
      event: {
        type: 'response.function_call_arguments.done',
        item_id: 'call_1',
        output_index: 0,
      },
    },
    {
      name: 'negative output index',
      event: {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: -1,
        delta: 'x',
      },
    },
    {
      name: 'non-integer output index',
      event: {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: 1.5,
        delta: 'x',
      },
    },
    {
      name: 'unsafe output index',
      event: {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: Number.MAX_SAFE_INTEGER + 1,
        delta: 'x',
      },
    },
    {
      name: 'invalid output item',
      event: {
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'unknown' },
      },
    },
  ];

  for (const testCase of invalidEvents) {
    test(`rejects ${testCase.name}`, async () => {
      const expected = testCase.name.includes('output index')
        ? 'Invalid Responses output index'
        : testCase.name.startsWith('invalid output item')
          ? 'Invalid Responses output item'
          : 'Invalid Responses event';
      await expectStreamFailure([testCase.event], expected);
    });
  }

  test('rejects a non-SSE success response and cancels its body', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{}'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const client = createClient({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      fetch: async () => new Response(body, {
        headers: { 'content-type': 'application/json' },
      }),
    });

    await expect(client.stream({
      model: 'test-model',
      input: 'hello',
    })).rejects.toThrow('Expected a text/event-stream response body');
    expect(cancelled).toBe(true);
  });

  test('rejects an SSE response without a body', async () => {
    const client = createClient({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      fetch: async () => new Response(null, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    });

    await expect(client.stream({
      model: 'test-model',
      input: 'hello',
    })).rejects.toThrow('Expected a text/event-stream response body');
  });

  test('cancels the response body when the stream consumer returns early', async () => {
    let cancelled = false;
    const body = byteStream(
      [sseEvent({
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: 0,
        delta: 'hello',
      })],
      {
        close: false,
        onCancel() {
          cancelled = true;
        },
      },
    );
    const client = createClient({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      fetch: async () => new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    });
    const stream = await client.stream({
      model: 'test-model',
      input: 'hello',
    });

    expect((await stream.next()).done).toBe(false);
    await stream.return(undefined);

    expect(cancelled).toBe(true);
  });

  test('passes the configured idle timeout to the SSE reader', async () => {
    const client = createClient({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      fetch: async () => new Response(new ReadableStream<Uint8Array>(), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    });
    const stream = await client.stream({
      model: 'test-model',
      input: 'hello',
    }, { idleTimeout: 5 });

    await expect(stream.next()).rejects.toThrow(
      'SSE idle timeout after 5ms',
    );
  });
});
