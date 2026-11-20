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
] as const satisfies CommandInfo[];

export type CommandName = (typeof COMMANDS)[number]['name'];

export type Input =
  | {
    type: 'message';
    text: string;
  }
  | {
    type: 'command';
    name: CommandName;
  };

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
  const command = raw.trimEnd();
  if (NAMES.has(command)) {
    return {
      type: 'command',
      name: command as CommandName,
    };
  }
  return {
    type: 'message',
    text: raw.startsWith('//') ? raw.slice(1) : raw,
  };
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
  { name }: Extract<Input, { type: 'command' }>,
): CommandResult {
  switch (name) {
    case '/model': {
      return {
        type: 'panelRequest',
        panel: 'model',
      };
    }
    case '/config': {
      return {
        type: 'panelRequest',
        panel: 'config',
      };
    }
    case '/prompt': {
      return {
        type: 'panelRequest',
        panel: 'prompt',
      };
    }
    case '/new': {
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
