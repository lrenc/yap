import { describe, expect, test } from 'bun:test';
import { Agent, type AgentOptions } from '../../src/agent/agent.ts';
import type { AgentRuntimeConfig } from '../../src/agent/ports.ts';
import type { AgentEvent } from '../../src/agent/run/types.ts';
import type {
  OpenAIClient,
  OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from '../../src/model/provider/openai/types.ts';
import type { AgentTool } from '../../src/tools/types.ts';

function response(text: string): OpenAIResponse {
  return {
    id: 'response_1',
    status: 'completed',
    output: [{
      type: 'message',
      id: 'message_1',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    }],
  };
}

function client(
  onStream: (params: ResponseCreateParams) => void = () => {},
): OpenAIClient {
  return {
    endpoint: 'https://example.test/v1/responses',
    async create() {
      return response('reply');
    },
    async stream(params): Promise<AsyncGenerator<ResponseStreamEvent>> {
      onStream(params);
      return (async function* events(): AsyncGenerator<ResponseStreamEvent> {
        yield {
          type: 'response.output_text.delta',
          item_id: 'message_1',
          output_index: 0,
          delta: 'reply',
        };
        yield {
          type: 'response.completed',
          response: response('reply'),
        };
      })();
    },
  };
}

function testTool(name = 'echo'): AgentTool {
  return {
    name,
    description: 'Echo the input',
    parameters: {},
    async execute() {
      return 'ok';
    },
  };
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

function createAgent(
  overrides: AgentOptions = {},
  onStream?: (params: ResponseCreateParams) => void,
): Agent {
  const testClient = client(onStream);
  return new Agent({
    cwd: process.cwd(),
    settings: {
      config: {
        activeModelId: 'deepseek-flash',
        modelSettings: {},
      },
      warnings: [],
      load: async () => {},
      setModel: async () => {},
      setReasoningEffort: async () => {},
      setActivePrompt: async () => {},
    },
    secrets: {
      warnings: [],
      load: async () => {},
      getApiKey: async () => 'test-key',
      setApiKey: async () => {},
      clearApiKey: async () => {},
    },
    prompts: {
      warnings: [],
      loadSelected: async () => ({
        content: 'Be concise',
        missingPrompt: undefined,
      }),
      list: async () => [],
      create: async () => {},
      update: async () => {},
      delete: async () => {},
      read: async () => undefined,
    },
    clients: {
      async getModel(modelId) {
        return {
          id: modelId,
          contextWindow: 128_000,
          params: {
            max_output_tokens: 1_024,
          },
          client: testClient,
        };
      },
    },
    ...overrides,
  });
}

describe('Agent', () => {
  test('owns its model catalog and stores defensive tool copies', () => {
    const tool = testTool();
    const tools = [tool];
    const agent = createAgent({ tools });

    expect(agent.instructions).toBe('');
    expect(agent.models.some(model => model.id === 'deepseek-flash')).toBe(true);
    expect(agent.tools).toEqual([tool]);
    expect(agent.tools).not.toBe(tools);
  });

  test('rejects duplicate tool names', () => {
    expect(() => createAgent({
      tools: [testTool(), testTool()],
    })).toThrow('Tool names must be unique');
  });

  test('owns lazy session and run lifecycles', async () => {
    const agent = createAgent({ tools: [] });

    expect(agent.hasSession).toBe(false);
    expect(agent.currentSessionId).toBeUndefined();
    expect(agent.newSession()).toBeUndefined();

    const first = agent.runStream('first');
    expect(first.sessionId).toBe(1);
    expect(first.runId).toBe(1);
    expect(agent.currentSessionId).toBe(1);
    await collect(first.stream);

    const second = agent.runStream('second');
    expect(second.sessionId).toBe(1);
    expect(second.runId).toBe(2);
    await collect(second.stream);

    expect(agent.newSession()).toBe(1);
    expect(agent.hasSession).toBe(false);

    const third = agent.runStream('third');
    expect(third.sessionId).toBe(2);
    expect(third.runId).toBe(3);
    await collect(third.stream);
  });

  test('cancels the current session before starting a new one', async () => {
    const agent = createAgent({ tools: [] });
    const first = agent.runStream('first');

    expect(agent.newSession()).toBe(first.sessionId);

    const events = await collect(first.stream);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      result: {
        stopReason: 'cancelled',
      },
    });
  });

  test('cannot start or mutate work after disposal', () => {
    const agent = createAgent({ tools: [] });
    agent.dispose();

    expect(() => agent.runStream('again'))
      .toThrow('Agent has been disposed');
    expect(() => agent.newSession())
      .toThrow('Agent has been disposed');
    expect(() => agent.setModel('deepseek-flash'))
      .toThrow('Agent has been disposed');
    expect(() => agent.dispose()).not.toThrow();
  });

  test('does not create a session for empty input', () => {
    const agent = createAgent({ tools: [] });

    expect(() => agent.runStream('   ')).toThrow('Message must not be empty');
    expect(agent.hasSession).toBe(false);
  });

  test('uses Agent instructions when no explicit Prompt is selected', async () => {
    const instructions: string[] = [];
    const agent = createAgent({
      instructions: 'Agent instructions',
      prompts: {
        warnings: [],
        loadSelected: async () => ({
          content: 'Built-in default',
          missingPrompt: undefined,
        }),
        list: async () => [],
        create: async () => {},
        update: async () => {},
        delete: async () => {},
        read: async () => undefined,
      },
    }, params => instructions.push(params.instructions ?? ''));

    await collect(agent.runStream('hello').stream);

    expect(instructions).toEqual(['Agent instructions']);
  });

  test('gives an explicit Prompt precedence over Agent instructions', async () => {
    const instructions: string[] = [];
    const agent = createAgent({
      instructions: 'Agent instructions',
      settings: {
        config: {
          activeModelId: 'deepseek-flash',
          modelSettings: {},
          activePrompt: 'reviewer',
        },
        warnings: [],
        load: async () => {},
        setModel: async () => {},
        setReasoningEffort: async () => {},
        setActivePrompt: async () => {},
      },
      prompts: {
        warnings: [],
        loadSelected: async () => ({
          content: 'Selected Prompt',
          missingPrompt: undefined,
        }),
        list: async () => [],
        create: async () => {},
        update: async () => {},
        delete: async () => {},
        read: async () => undefined,
      },
    }, params => instructions.push(params.instructions ?? ''));

    await collect(agent.runStream('hello').stream);

    expect(instructions).toEqual(['Selected Prompt']);
  });

  test('uses Agent instructions when the selected Prompt is missing', async () => {
    const instructions: string[] = [];
    const agent = createAgent({
      instructions: 'Agent instructions',
      settings: {
        config: {
          activeModelId: 'deepseek-flash',
          modelSettings: {},
          activePrompt: 'missing',
        },
        warnings: [],
        load: async () => {},
        setModel: async () => {},
        setReasoningEffort: async () => {},
        setActivePrompt: async () => {},
      },
      prompts: {
        warnings: [],
        loadSelected: async () => ({
          content: 'Built-in default',
          missingPrompt: 'missing',
        }),
        list: async () => [],
        create: async () => {},
        update: async () => {},
        delete: async () => {},
        read: async () => undefined,
      },
    }, params => instructions.push(params.instructions ?? ''));

    await collect(agent.runStream('hello').stream);

    expect(instructions).toEqual(['Agent instructions']);
  });

  test('resolves a run from one configuration snapshot', async () => {
    let request: ResponseCreateParams | undefined;
    let markModelStarted!: () => void;
    const modelStarted = new Promise<void>(resolve => {
      markModelStarted = resolve;
    });
    let releaseModel!: () => void;
    const modelGate = new Promise<void>(resolve => {
      releaseModel = resolve;
    });
    const config: AgentRuntimeConfig = {
      activeModelId: 'deepseek-flash',
      activePrompt: 'old',
      modelSettings: {
        'deepseek-flash': { reasoningEffort: 'low' },
        'deepseek-v4-pro': { reasoningEffort: 'max' },
      },
    };
    const testClient = client(params => {
      request = params;
    });
    const agent = createAgent({
      instructions: 'Agent instructions',
      settings: {
        config,
        warnings: [],
        load: async () => {},
        setModel: async modelId => {
          config.activeModelId = modelId;
        },
        setReasoningEffort: async () => {},
        setActivePrompt: async name => {
          config.activePrompt = name;
        },
      },
      prompts: {
        warnings: [],
        loadSelected: async name => ({
          content: `Prompt: ${name ?? 'default'}`,
          missingPrompt: undefined,
        }),
        list: async () => [],
        create: async () => {},
        update: async () => {},
        delete: async () => {},
        read: async () => undefined,
      },
      clients: {
        async getModel(modelId) {
          markModelStarted();
          await modelGate;
          return {
            id: modelId,
            contextWindow: 128_000,
            params: {
              max_output_tokens: 1_024,
            },
            client: testClient,
          };
        },
      },
    });

    const run = agent.runStream('hello');
    await modelStarted;
    await agent.setModel('deepseek-v4-pro');
    await agent.setActivePrompt(undefined);
    releaseModel();
    await collect(run.stream);

    expect(request).toMatchObject({
      model: 'deepseek-flash',
      instructions: 'Prompt: old',
      reasoning: {
        effort: 'low',
      },
    });
  });
});
