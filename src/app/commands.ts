import type { Model } from '../model/types.ts';

type CommandResult =
  | { type: 'notice'; level: 'error'; message: string }
  | { type: 'panelRequest'; panel: 'model' | 'config' | 'prompt' }
  | { type: 'newSession' }
  | { type: 'noop' };

type Dependencies = {
  models: readonly Model[];
  settings: {
    setModel(modelId: string): Promise<void>;
    setActivePrompt(name: string | undefined): Promise<void>;
  };
  prompts: {
    read(name: string): Promise<string | undefined>;
  };
};

export interface CommandInfo {
  readonly name: string;
  readonly usage: string;
  readonly description: string;
}

const COMMANDS = [
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
] as const satisfies readonly CommandInfo[];

export type CommandName = (typeof COMMANDS)[number]['name'];

export type Input =
  | { type: 'message'; text: string }
  | { type: 'command'; name: CommandName; args: readonly string[] };

const NAMES = new Set<string>(COMMANDS.map(command => command.name));

const HELP = `Commands: ${COMMANDS.map(command => command.usage).join(', ')}.`;

function failure(message: string): CommandResult {
  return {
    type: 'notice',
    level: 'error',
    message: `${message}\n${HELP}`,
  };
}

export function parseInput(raw: string): Input {
  if (raw.startsWith('//')) {
    return { type: 'message', text: raw.slice(1) };
  }
  const [name = '', ...args] = raw.trimEnd().split(/\s+/u);
  if (NAMES.has(name)) {
    return { type: 'command', name: name as CommandName, args };
  }
  return { type: 'message', text: raw };
}

export function isCommandDraft(input: string): boolean {
  return input.startsWith('/')
    && !input.startsWith('//')
    && !/\s/u.test(input);
}

export function suggestCommands(input: string): readonly CommandInfo[] {
  if (!isCommandDraft(input)) {
    return [];
  }
  return COMMANDS.filter(command => command.name.startsWith(input));
}

export async function executeCommand(
  { name, args }: Extract<Input, { type: 'command' }>,
  { models, settings, prompts }: Dependencies,
): Promise<CommandResult> {
  const argument = args[0];
  try {
    switch (name) {
      case '/model': {
        if (args.length > 1) {
          return failure('/model accepts at most one model ID.');
        }
        if (argument === undefined) {
          return {
            type: 'panelRequest',
            panel: 'model',
          };
        }
        if (!models.some(model => model.id === argument)) {
          return failure(
            `Unknown model ID. Available models: ${models.map(model => model.id).join(', ')}.`
          );
        }
        await settings.setModel(argument);
        return { type: 'noop' };
      }
      case '/config': {
        if (args.length > 0) {
          return failure('/config does not accept arguments.');
        }
        return {
          type: 'panelRequest',
          panel: 'config',
        };
      }
      case '/prompt': {
        if (args.length > 1) {
          return failure('/prompt accepts at most one Prompt name.');
        }
        if (argument === undefined) {
          return {
            type: 'panelRequest',
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
          argument === 'default' ? undefined : argument
        );
        return { type: 'noop' };
      }
      case '/new': {
        if (args.length > 0) {
          return failure('/new does not accept arguments.');
        }
        return {
          type: 'newSession',
        };
      }
      default: {
        name satisfies never;
        return failure('Unknown command.');
      }
    }
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : 'Command failed.'
    );
  }
}
