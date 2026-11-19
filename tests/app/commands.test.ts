import { describe, expect, test } from 'bun:test';
import {
  executeCommand,
  parseInput,
  suggestCommands,
} from '../../src/app/commands.ts';
import { models } from '../../src/agent/models.ts';

function cmd(input: string) {
  const item = parseInput(input);
  if (item.type !== 'command') {
    throw new Error(`Not a command: ${input}`);
  }
  return item;
}

describe('input parsing', () => {
  test('recognizes exact command names', () => {
    expect(parseInput('/new')).toEqual({
      type: 'command',
      name: '/new',
      args: [],
    });
    expect(parseInput('/model deepseek')).toEqual({
      type: 'command',
      name: '/model',
      args: ['deepseek'],
    });
  });

  test('keeps other slash text as messages', () => {
    expect(parseInput('/usr/local/bin')).toEqual({
      type: 'message',
      text: '/usr/local/bin',
    });
    expect(parseInput('/unknown')).toEqual({
      type: 'message',
      text: '/unknown',
    });
    expect(parseInput('/model-copy')).toEqual({
      type: 'message',
      text: '/model-copy',
    });
  });

  test('unescapes double-slash messages', () => {
    expect(parseInput('//new')).toEqual({
      type: 'message',
      text: '/new',
    });
  });
});

describe('command suggestions', () => {
  test('lists every command after a slash', () => {
    expect(suggestCommands('/').map(command => command.name)).toEqual([
      '/model',
      '/config',
      '/prompt',
      '/new',
    ]);
  });

  test('filters commands by prefix', () => {
    expect(suggestCommands('/m').map(command => command.name)).toEqual([
      '/model',
    ]);
    expect(suggestCommands('/pro').map(command => command.name)).toEqual([
      '/prompt',
    ]);
  });

  test('hides suggestions outside the command name', () => {
    expect(suggestCommands('model')).toEqual([]);
    expect(suggestCommands('/model ')).toEqual([]);
    expect(suggestCommands('/unknown')).toEqual([]);
    expect(suggestCommands('//new')).toEqual([]);
  });

  test('applies configuration commands without emitting notices', async () => {
    const modelId = models[0]!.id;
    let selectedModel: string | undefined;
    let selectedPrompt: string | undefined;
    const dependencies = {
      models,
      settings: {
        setModel: async (id: string) => {
          selectedModel = id;
        },
        setActivePrompt: async (name: string | undefined) => {
          selectedPrompt = name;
        },
      },
      prompts: {
        read: async () => 'Prompt',
      },
    };

    expect(await executeCommand(cmd(`/model ${modelId}`), dependencies))
      .toEqual({ type: 'noop' });
    expect(await executeCommand(cmd('/prompt reviewer'), dependencies))
      .toEqual({ type: 'noop' });
    expect(selectedModel).toBe(modelId);
    expect(selectedPrompt).toBe('reviewer');
  });

  test('rejects Prompt names containing whitespace', async () => {
    let selectedPrompt: string | undefined;
    const result = await executeCommand(cmd('/prompt my prompt'), {
      models,
      settings: {
        setModel: async () => {},
        setActivePrompt: async (name: string | undefined) => {
          selectedPrompt = name;
        },
      },
      prompts: {
        read: async () => 'Prompt',
      },
    });

    expect(result).toMatchObject({
      type: 'notice',
      level: 'error',
      message: expect.stringContaining(
        '/prompt accepts at most one Prompt name.'
      ),
    });
    expect(selectedPrompt).toBeUndefined();
  });
});
