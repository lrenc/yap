type CommandResult =
  | { type: 'notice'; level: 'error'; message: string }
  | { type: 'panelRequest'; panel: 'model' | 'config' | 'prompt' }
  | { type: 'newSession' };

export interface CommandInfo {
  name: string;
  usage: string;
  description: string;
}

const COMMANDS = [
  {
    name: '/model',
    usage: '/model',
    description: 'Select a model',
  },
  {
    name: '/config',
    usage: '/config',
    description: 'Open configuration settings',
  },
  {
    name: '/prompt',
    usage: '/prompt',
    description: 'Manage Prompts',
  },
  {
    name: '/new',
    usage: '/new',
    description: 'Start a new chat',
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

export function executeCommand(
  { name, args }: Extract<Input, { type: 'command' }>,
): CommandResult {
  switch (name) {
    case '/model': {
      if (args.length > 0) {
        return failure('/model does not accept arguments.');
      }
      return {
        type: 'panelRequest',
        panel: 'model',
      };
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
      if (args.length > 0) {
        return failure('/prompt does not accept arguments.');
      }
      return {
        type: 'panelRequest',
        panel: 'prompt',
      };
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
}
