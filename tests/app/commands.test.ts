import { describe, expect, test } from 'bun:test';
import {
  executeCommand,
  parseInput,
  suggestCommands,
} from '../../src/app/commands.ts';

function cmd(input: string) {
  const item = parseInput(input);
  if (item.type !== 'command') {
    throw new Error(`Not a command: ${input}`);
  }
  return item;
}

describe('input parsing', () => {
  test('recognizes command names', () => {
    expect(parseInput('/new')).toEqual({
      type: 'command',
      name: '/new',
    });
    expect(parseInput('/prompt')).toEqual({
      type: 'command',
      name: '/prompt',
    });
  });

  test('keeps other slash text as messages', () => {
    expect(parseInput('/model foo')).toEqual({
      type: 'message',
      text: '/model foo',
    });
    expect(parseInput('/model 命令的处理逻辑是什么？')).toEqual({
      type: 'message',
      text: '/model 命令的处理逻辑是什么？',
    });
    expect(parseInput('/prompt default')).toEqual({
      type: 'message',
      text: '/prompt default',
    });
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
    expect(parseInput('//model')).toEqual({
      type: 'message',
      text: '/model',
    });
    expect(parseInput('//model foo')).toEqual({
      type: 'message',
      text: '/model foo',
    });
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

  test('opens the model picker for the exact command', () => {
    expect(executeCommand(cmd('/model')))
      .toEqual({ type: 'panelRequest', panel: 'model' });
    expect(executeCommand(cmd('/model ')))
      .toEqual({ type: 'panelRequest', panel: 'model' });
  });

  test('opens the Prompt panel for the exact command', () => {
    expect(executeCommand(cmd('/prompt')))
      .toEqual({ type: 'panelRequest', panel: 'prompt' });
    expect(executeCommand(cmd('/prompt ')))
      .toEqual({ type: 'panelRequest', panel: 'prompt' });
  });
});
