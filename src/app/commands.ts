import { models } from './models.ts';
import type { PromptRepository } from './settings/prompts.ts';
import type { SettingsStore } from './settings/store.ts';

export type CommandResult =
  | { type: 'notice'; level: 'info' | 'error'; message: string }
  | { type: 'panel_request'; panel: 'model' | 'config' | 'prompt' }
  | { type: 'new_session' }
  | { type: 'noop' };

type Dependencies = {
  settings: Pick<SettingsStore, 'setModel' | 'setActivePrompt'>;
  prompts: Pick<PromptRepository, 'read'>;
};

export interface CommandInfo {
  readonly name: string;
  readonly usage: string;
  readonly description: string;
}

export const COMMANDS: readonly CommandInfo[] = [
  {
    name: '/model',
    usage: '/model [id]',
    description: 'Select a model',
  },
  {
    name: '/config',
    usage: '/config',
    description: 'Configure credentials and reasoning effort',
  },
  {
    name: '/prompt',
    usage: '/prompt [name|default]',
    description: 'Select or manage Prompts',
  },
  {
    name: '/new',
    usage: '/new',
    description: 'Start a new conversation',
  },
];

const HELP = `Commands: ${COMMANDS.map(command => command.usage).join(', ')}.`;

function failure(message: string): CommandResult {
  return {
    type: 'notice',
    level: 'error',
    message: `${message}\n${HELP}`,
  };
}

export function isCommand(input: string): boolean {
  return input.startsWith('/');
}

export function suggestCommands(input: string): readonly CommandInfo[] {
  if (!isCommand(input) || /\s/u.test(input)) {
    return [];
  }
  return COMMANDS.filter(command => command.name.startsWith(input));
}

export async function executeCommand(
  input: string,
  { settings, prompts }: Dependencies,
): Promise<CommandResult> {
  if (!isCommand(input)) {
    return { type: 'noop' };
  }
  const [command, ...args] = input.trimEnd().split(/\s+/u);
  const argument = args[0];
  try {
    switch (command) {
      case '/model': {
        if (args.length > 1) {
          return failure('/model accepts at most one model ID.');
        }
        if (argument === undefined) {
          return {
            type: 'panel_request',
            panel: 'model',
          };
        }
        if (!models.some(model => model.id === argument)) {
          return failure(
            `Unknown model ID. Available models: ${models.map(model => model.id).join(', ')}.`
          );
        }
        await settings.setModel(argument);
        return {
          type: 'notice',
          level: 'info',
          message: `Model changed to ${argument}; applies from the next run.`,
        };
      }
      case '/config': {
        if (args.length > 0) {
          return failure('/config does not accept arguments.');
        }
        return {
          type: 'panel_request',
          panel: 'config',
        };
      }
      case '/prompt': {
        if (args.length > 1) {
          return failure('/prompt accepts at most one Prompt name.');
        }
        if (argument === undefined) {
          return {
            type: 'panel_request',
            panel: 'prompt',
          };
        }
        if (
          argument !== 'default'
          && await prompts.read(argument) === undefined
        ) {
          return failure(
            'Prompt not found. Use /prompt to choose an existing Prompt.'
          );
        }
        await settings.setActivePrompt(
          argument === 'default' ? null : argument
        );
        return {
          type: 'notice',
          level: 'info',
          message: `Prompt changed to ${argument}; applies from the next run.`,
        };
      }
      case '/new': {
        if (args.length > 0) {
          return failure('/new does not accept arguments.');
        }
        return {
          type: 'new_session',
        };
      }
      default: {
        return failure('Unknown command.');
      }
    }
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : 'Command failed.'
    );
  }
}
