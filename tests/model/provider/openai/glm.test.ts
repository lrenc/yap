import { describe, expect, test } from 'bun:test';
import { createClient } from '../../../../src/model/provider/openai/client.ts';
import type {
  ResponseCreateParams,
  ResponseStreamEvent,
} from '../../../../src/model/provider/openai/types.ts';
import { byteStream, sseEvent } from '../../../helpers/streams.ts';

const glm = {
  apiKey: 'test-key',
  baseURL: 'https://open.bigmodel.cn/api/v1',
  adapter: 'glm' as const,
};

async function collect(
  events: AsyncGenerator<ResponseStreamEvent>,
): Promise<ResponseStreamEvent[]> {
  const result: ResponseStreamEvent[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}

describe('GLM Responses adapter', () => {
  test('encodes the request and normalizes the response', async () => {
    const captured: { request: Request | null } = { request: null };
    const client = createClient({
      ...glm,
      fetch: async (input, init) => {
        captured.request = new Request(input, init);
        return new Response(JSON.stringify({
          id: 'resp_glm',
          status: 'completed',
          output: [
            {
              type: 'reasoning',
              id: 'reasoning_1',
              status: 'completed',
              content: {
                type: 'reasoning_text',
                text: 'private reasoning',
              },
            },
            {
              type: 'message',
              id: 'message_1',
              role: 'assistant',
              status: 'completed',
              content: {
                type: 'output_text',
                text: 'hello',
              },
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 4,
            output_tokens_details: {
              reasoning_tokens: 3,
            },
          },
        }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const params: ResponseCreateParams = {
      model: 'glm-5.3',
      instructions: 'Be concise',
      input: [
        {
          role: 'user',
          content: 'hello',
        },
        {
          type: 'reasoning',
          id: 'reasoning_old',
          summary: [{ type: 'summary_text', text: 'old summary' }],
          content: [{
            type: 'reasoning_text',
            text: 'old reasoning',
          }],
        },
        {
          type: 'message',
          id: 'message_old',
          role: 'assistant',
          phase: 'commentary',
          content: [
            { type: 'output_text', text: 'old answer' },
            { type: 'refusal', refusal: 'old refusal' },
          ],
        },
        {
          type: 'function_call',
          id: 'item_1',
          call_id: 'call_1',
          name: 'lookup',
          arguments: '{"id":1}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '{"value":"found"}',
        },
      ],
      tools: [{
        type: 'function',
        name: 'lookup',
        description: 'Look up a value',
        parameters: { type: 'object' },
        strict: true,
      }],
      tool_choice: 'auto',
      parallel_tool_calls: false,
      include: ['reasoning.encrypted_content'],
      store: false,
      reasoning: { effort: 'max' },
    };

    const response = await client.create(params);

    expect(client.endpoint).toBe(
      'https://open.bigmodel.cn/api/v1/responses'
    );
    expect(await captured.request?.json()).toEqual({
      model: 'glm-5.3',
      instructions: 'Be concise',
      input: [
        {
          type: 'message',
          role: 'user',
          content: 'hello',
        },
        {
          type: 'reasoning',
          content: {
            type: 'reasoning_text',
            text: 'old reasoning',
          },
        },
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'old answer' },
            { type: 'output_text', text: 'old refusal' },
          ],
        },
        {
          type: 'function_call',
          name: 'lookup',
          call_id: 'call_1',
          arguments: '{"id":1}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '{"value":"found"}',
        },
      ],
      tools: [{
        type: 'function',
        name: 'lookup',
        description: 'Look up a value',
        parameters: { type: 'object' },
      }],
      tool_choice: 'auto',
      store: false,
      reasoning: { effort: 'max' },
      stream: false,
    });
    expect(response).toEqual({
      id: 'resp_glm',
      status: 'completed',
      output: [
        {
          type: 'reasoning',
          id: 'reasoning_1',
          summary: [],
          content: [{
            type: 'reasoning_text',
            text: 'private reasoning',
          }],
        },
        {
          type: 'message',
          id: 'message_1',
          role: 'assistant',
          content: [{
            type: 'output_text',
            text: 'hello',
          }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        output_tokens_details: {
          reasoning_tokens: 3,
        },
      },
    });
  });

  test('normalizes streaming reasoning, output, and terminal events', async () => {
    const reasoningItem: unknown = {
      type: 'reasoning',
      id: 'reasoning_1',
      status: 'completed',
      content: {
        type: 'reasoning_text',
        text: 'private reasoning',
      },
    };
    const messageItem: unknown = {
      type: 'message',
      id: 'message_1',
      role: 'assistant',
      status: 'completed',
      content: {
        type: 'output_text',
        text: 'hello',
      },
    };
    const completed = {
      id: 'resp_glm',
      status: 'completed',
      output: [reasoningItem, messageItem],
    };
    const body = byteStream([
      sseEvent({
        type: 'response.reasoning_text.delta',
        item_id: 'reasoning_1',
        output_index: 0,
        content_index: 0,
        delta: 'private reasoning',
      }),
      sseEvent({
        type: 'response.output_text.delta',
        item_id: 'message_1',
        output_index: 1,
        content_index: 0,
        delta: 'hello',
      }),
      sseEvent({
        type: 'response.output_item.done',
        output_index: 0,
        item: reasoningItem,
      }),
      sseEvent({
        type: 'response.output_item.done',
        output_index: 1,
        item: messageItem,
      }),
      sseEvent({
        type: 'response.completed',
        response: completed,
      }),
    ]);
    const client = createClient({
      ...glm,
      fetch: async () => new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    });

    const events = await collect(await client.stream({
      model: 'glm-5.3',
      input: 'hello',
      tools: [{
        type: 'function',
        name: 'lookup',
        description: 'Look up a value',
        parameters: { type: 'object' },
        strict: true,
      }],
      parallel_tool_calls: false,
    }));

    expect(events.map(event => event.type)).toEqual([
      'response.output_text.delta',
      'response.output_item.done',
      'response.output_item.done',
      'response.completed',
    ]);
    const reasoning = events[1];
    expect(reasoning?.type).toBe('response.output_item.done');
    if (reasoning?.type === 'response.output_item.done') {
      expect(reasoning.item.type).toBe('reasoning');
      if (reasoning.item.type === 'reasoning') {
        expect(reasoning.item.summary).toEqual([]);
        expect(reasoning.item.content).toEqual([{
          type: 'reasoning_text',
          text: 'private reasoning',
        }]);
      }
    }
    const terminal = events.at(-1);
    expect(terminal?.type).toBe('response.completed');
    if (terminal?.type === 'response.completed') {
      expect(terminal.response.output[1]?.type).toBe('message');
      expect(terminal.response.output[1]).toMatchObject({
        content: [{ type: 'output_text', text: 'hello' }],
      });
    }
  });

  test('rejects unsupported tool choices before sending a request', async () => {
    let called = false;
    const client = createClient({
      ...glm,
      fetch: async () => {
        called = true;
        throw new Error('fetch should not run');
      },
    });

    await expect(client.create({
      model: 'glm-5.3',
      input: 'hello',
      tool_choice: { type: 'function', name: 'lookup' },
    })).rejects.toThrow(
      'GLM Responses supports only auto or none tool_choice'
    );
    expect(called).toBe(false);
  });
});
