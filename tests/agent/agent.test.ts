import { describe, expect, test } from 'bun:test';
import { Agent } from '../../src/agent/agent.ts';
import { Session } from '../../src/agent/session/session.ts';
import type { AgentTool } from '../../src/tools/types.ts';
import { testModel } from '../model/helpers.ts';

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

describe('Agent', () => {
  test('uses defaults and stores defensive copies', () => {
    const model = testModel();
    const tool = testTool();
    const models = [model];
    const tools = [tool];
    const agent = new Agent({ models, tools });

    expect(agent.instructions).toBe('');
    expect(agent.models).toEqual([model]);
    expect(agent.tools).toEqual([tool]);
    expect(agent.models).not.toBe(models);
    expect(agent.tools).not.toBe(tools);
  });

  test('rejects an empty model list', () => {
    expect(() => new Agent({ models: [] })).toThrow();
  });

  test('rejects duplicate model IDs', () => {
    expect(() => new Agent({
      models: [testModel(), testModel()],
    })).toThrow('Model IDs must be unique');
  });

  test('rejects duplicate tool names', () => {
    expect(() => new Agent({
      models: [testModel()],
      tools: [testTool(), testTool()],
    })).toThrow('Tool names must be unique');
  });

  test('creates a session with the agent configuration', () => {
    const agent = new Agent({
      models: [testModel()],
      tools: [testTool()],
    });

    const session = agent.createSession({
      getModelSelection: () => ({ modelId: 'test-model' }),
    });

    expect(session).toBeInstanceOf(Session);
  });
});
