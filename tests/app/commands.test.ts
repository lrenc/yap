import { describe, expect, test } from 'bun:test';
import { executeCommand, suggestCommands } from '../../src/app/commands.ts';
import { models } from '../../src/agent/models.ts';

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

    expect(await executeCommand(`/model ${modelId}`, dependencies))
      .toEqual({ type: 'noop' });
    expect(await executeCommand('/prompt reviewer', dependencies))
      .toEqual({ type: 'noop' });
    expect(selectedModel).toBe(modelId);
    expect(selectedPrompt).toBe('reviewer');
  });

  test('rejects Prompt names containing whitespace', async () => {
    let selectedPrompt: string | undefined;
    const result = await executeCommand('/prompt my prompt', {
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
