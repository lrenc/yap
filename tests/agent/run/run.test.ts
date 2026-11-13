import { describe, expect, test } from 'bun:test';
import { Run } from '../../../src/agent/run/run.ts';
import type {
  AgentEvent,
  AgentResult,
} from '../../../src/agent/run/types.ts';
import type { AgentConfig } from '../../../src/agent/types.ts';
import { Context } from '../../../src/context/context.ts';
import type {
  OpenAIClient,
  OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from '../../../src/model/provider/openai/types.ts';
import { createClient } from '../../../src/model/provider/openai/client.ts';
import type { AgentModel } from '../../../src/model/types.ts';
import type { AgentTool } from '../../../src/tools/types.ts';

function refusalResponse(): OpenAIResponse {
  return {
    id: 'resp_refusal',
    status: 'completed',
    output: [{
      type: 'message',
      id: 'message_refusal',
      role: 'assistant',
      content: [{ type: 'refusal', refusal: 'not allowed' }],
    }],
  };
}

function toolResponse(): OpenAIResponse {
  return {
    id: 'resp_tool',
    status: 'completed',
    output: [{
      type: 'function_call',
      id: 'call_item',
      call_id: 'call_1',
      name: 'echo',
      arguments: JSON.stringify({ value: 'hello' }),
    }],
  };
}

function textResponse(text: string): OpenAIResponse {
  return {
    id: 'resp_text',
    status: 'completed',
    output: [{
      type: 'message',
      id: 'message_text',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    }],
  };
}

function createRun(onRequest?: () => void): Run {
  const response = refusalResponse();
  const client: OpenAIClient = {
    endpoint: 'https://example.test/v1/responses',
    async create() {
      throw new Error('create is not used');
    },
    async stream(): Promise<AsyncGenerator<ResponseStreamEvent>> {
      onRequest?.();
      return (async function* events(): AsyncGenerator<ResponseStreamEvent> {
        yield {
          type: 'response.refusal.delta',
          item_id: 'message_refusal',
          output_index: 0,
          delta: 'not ',
        };
        yield {
          type: 'response.refusal.delta',
          item_id: 'message_refusal',
          output_index: 0,
          delta: 'allowed',
        };
        yield {
          type: 'response.refusal.done',
          item_id: 'message_refusal',
          output_index: 0,
          refusal: 'not allowed',
        };
        yield {
          type: 'response.completed',
          response,
        };
      })();
    },
  };
  const model: AgentModel = {
    id: 'test-model',
    client,
    contextWindow: 128_000,
    params: {
      max_output_tokens: 100,
    },
  };
  const agent: AgentConfig = {
    instructions: 'Be concise',
    models: [model],
    tools: [],
  };

  return new Run(agent, new Context(), {
    content: 'hello',
    resolveRunConfig: () => ({
      model,
      instructions: agent.instructions,
    }),
    streaming: true,
    signal: new AbortController().signal,
  });
}

function createRunWith(
  client: OpenAIClient,
  options: {
    signal?: AbortSignal;
    streaming?: boolean;
    tools?: AgentTool[];
  } = {},
): Run {
  const model: AgentModel = {
    id: 'test-model',
    client,
    contextWindow: 128_000,
    params: {
      max_output_tokens: 100,
    },
  };
  const agent: AgentConfig = {
    instructions: 'Be concise',
    models: [model],
    tools: options.tools ?? [],
  };

  return new Run(agent, new Context(), {
    content: 'hello',
    resolveRunConfig: () => ({
      model,
      instructions: agent.instructions,
    }),
    streaming: options.streaming ?? true,
    signal: options.signal ?? new AbortController().signal,
  });
}

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('Run', () => {
  test('emits incremental refusal events before the final response', async () => {
    const run = createRun();
    const result = await run.execute();
    const events = await collect(run.stream);

    expect(result.stopReason).toBe('completed');
    expect(events.map(event => event.type)).toEqual([
      'turn_start',
      'refusal_delta',
      'refusal_delta',
      'text_done',
      'done',
    ]);
    expect(events.filter(event => event.type === 'refusal_delta')).toEqual([
      { type: 'refusal_delta', turn: 1, delta: 'not ' },
      { type: 'refusal_delta', turn: 1, delta: 'allowed' },
    ]);
    expect(events.find(event => event.type === 'text_done')).toEqual({
      type: 'text_done',
      turn: 1,
      text: 'not allowed',
      parts: [{ type: 'refusal', refusal: 'not allowed' }],
    });
  });

  test('executes only once', async () => {
    let requests = 0;
    const run = createRun(() => {
      requests += 1;
    });

    const first = run.execute();
    const second = run.execute();

    expect(second).toBe(first);
    expect(await first).toBe(await second);
    expect(requests).toBe(1);
    expect((await collect(run.stream))
      .filter(event => event.type === 'done')).toHaveLength(1);
  });

  test('returns an existing result without executing again', async () => {
    let requests = 0;
    const run = createRun(() => {
      requests += 1;
    });
    const final: AgentResult = {
      stopReason: 'cancelled',
      response: null,
      turns: 0,
    };

    run.finish(final);

    expect(await run.execute()).toBe(final);
    expect(await run.result).toBe(final);
    expect(requests).toBe(0);
    expect(await collect(run.stream)).toEqual([{
      type: 'done',
      result: final,
    }]);
  });

  test('returns an error result when the request fails', async () => {
    const run = createRunWith({
      async create() {
        throw new Error('create is not used');
      },
      async stream() {
        throw new Error('provider failed');
      },
    });

    const result = await run.execute();
    const events = await collect(run.stream);

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual(new Error('provider failed'));
    expect(result.turns).toBe(1);
    expect(events.at(-1)).toEqual({
      type: 'done',
      result,
    });
  });

  test('rejects a stream without a final response', async () => {
    const run = createRunWith({
      async create() {
        throw new Error('create is not used');
      },
      async stream() {
        return (async function* events(): AsyncGenerator<ResponseStreamEvent> {
          // No terminal response.
        })();
      },
    });

    const result = await run.execute();

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual(new Error('Missing final model response'));
  });

  test('preserves a failed non-streaming response', async () => {
    let requests = 0;
    const client = createClient({
      apiKey: 'test-key',
      baseURL: 'https://example.test/v1',
      fetch: async () => {
        requests += 1;
        const response = requests === 1
          ? toolResponse()
          : {
            id: 'resp_failed',
            status: 'failed',
            output: [],
            error: {
              message: 'Prompt rejected',
            },
          };
        return new Response(JSON.stringify(response), {
          headers: {
            'content-type': 'application/json',
          },
        });
      },
    });
    const tool: AgentTool = {
      name: 'echo',
      description: 'Echo the input',
      parameters: {},
      async execute() {
        return 'ok';
      },
    };
    const run = createRunWith(client, {
      streaming: false,
      tools: [tool],
    });

    const result = await run.execute();

    expect(result.stopReason).toBe('error');
    expect(result.response?.id).toBe('resp_failed');
    expect(result.error).toHaveProperty('message', 'Prompt rejected');
  });

  test('does not request when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = createRunWith({
      async create() {
        throw new Error('create is not used');
      },
      async stream() {
        throw new Error('stream is not used');
      },
    }, {
      signal: controller.signal,
    });

    const result = await run.execute();

    expect(result).toEqual({
      stopReason: 'cancelled',
      response: null,
      turns: 0,
      error: undefined,
    });
  });

  test('compacts history before requesting the model', async () => {
    let summaries = 0;
    let requests = 0;
    const client: OpenAIClient = {
      async create() {
        summaries += 1;
        return textResponse('summary');
      },
      async stream(): Promise<AsyncGenerator<ResponseStreamEvent>> {
        requests += 1;
        return (async function* events(): AsyncGenerator<ResponseStreamEvent> {
          yield {
            type: 'response.completed',
            response: textResponse('finished'),
          };
        })();
      },
    };
    const context = new Context();
    for (let index = 0; index < 3; index += 1) {
      context.addUserMessage(`old user ${index}`);
      context.addResponse(textResponse('x'.repeat(20_000)));
    }
    context.addUserMessage('current user');
    const model: AgentModel = {
      id: 'test-model',
      client,
      contextWindow: 30_000,
      params: {
        max_output_tokens: 16_384,
      },
    };
    const run = new Run({ tools: [] }, context, {
      content: 'current user',
      resolveRunConfig: () => ({
        model,
        instructions: 'Be concise',
      }),
      streaming: true,
      signal: new AbortController().signal,
    });

    const result = await run.execute();
    const events = await collect(run.stream);

    expect(result.stopReason).toBe('completed');
    expect(summaries).toBe(1);
    expect(requests).toBe(1);
    expect(context.contextStart).toBeGreaterThan(0);
    expect(events.map(event => event.type)).toEqual([
      'compaction_start',
      'compaction_end',
      'turn_start',
      'text_done',
      'done',
    ]);
  });

  test('stops after three turns without new tool results', async () => {
    const requests: ResponseCreateParams[] = [];
    let toolCalls = 0;
    const client: OpenAIClient = {
      async create() {
        throw new Error('create is not used');
      },
      async stream(params): Promise<AsyncGenerator<ResponseStreamEvent>> {
        requests.push(params);
        const response = toolResponse();
        return (async function* events(): AsyncGenerator<ResponseStreamEvent> {
          yield {
            type: 'response.completed',
            response,
          };
        })();
      },
    };
    const tool: AgentTool = {
      name: 'echo',
      description: 'Echo the input',
      parameters: {},
      async execute() {
        toolCalls += 1;
        return 'same result';
      },
    };
    const run = createRunWith(client, {
      tools: [tool],
    });

    const result = await run.execute();

    expect(result.stopReason).toBe('stalled');
    expect(result.turns).toBe(5);
    expect(requests).toHaveLength(5);
    expect(toolCalls).toBe(4);
    expect(requests.at(-1)?.tool_choice).toBe('none');
    expect(JSON.stringify(requests.at(-1)?.input))
      .toContain('Repeated tool calls have produced no new successful information');
  });

  test('runs tool calls before requesting the next turn', async () => {
    const requests: ResponseCreateParams[] = [];
    const client: OpenAIClient = {
      async create() {
        throw new Error('create is not used');
      },
      async stream(params): Promise<AsyncGenerator<ResponseStreamEvent>> {
        requests.push(params);
        const response = requests.length === 1
          ? toolResponse()
          : textResponse('finished');
        return (async function* events(): AsyncGenerator<ResponseStreamEvent> {
          yield {
            type: 'response.completed',
            response,
          };
        })();
      },
    };
    const tool: AgentTool = {
      name: 'echo',
      description: 'Echo the input',
      parameters: {},
      async execute(args) {
        return JSON.stringify(args);
      },
    };
    const model: AgentModel = {
      id: 'test-model',
      client,
      contextWindow: 128_000,
      params: {
        max_output_tokens: 100,
      },
    };
    const run = new Run({ tools: [tool] }, new Context(), {
      content: 'hello',
      resolveRunConfig: () => ({
        model,
        instructions: 'Use tools',
      }),
      streaming: true,
      signal: new AbortController().signal,
    });

    const result = await run.execute();
    const events = await collect(run.stream);

    expect(result.stopReason).toBe('completed');
    expect(result.turns).toBe(2);
    expect(events.map(event => event.type)).toEqual([
      'turn_start',
      'text_done',
      'tool_start',
      'tool_end',
      'turn_start',
      'text_done',
      'done',
    ]);
    expect(JSON.stringify(requests[1]?.input))
      .toContain('function_call_output');
  });
});
