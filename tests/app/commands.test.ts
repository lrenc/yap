import { describe, expect, test } from 'bun:test';
import { suggestCommands } from '../../src/app/commands.ts';

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
});
