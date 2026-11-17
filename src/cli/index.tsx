import { render } from 'ink';
import { createMouseInput, DISABLE_MOUSE, ENABLE_MOUSE } from './input/mouse.ts';
import { Terminal } from './terminal.tsx';

const ENTER_ALT_SCREEN = '\x1b[?1049h\x1b[H';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Please run Yap in an interactive terminal.');
  process.exitCode = 1;
} else {
  try {
    await start();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Cannot start Yap.'
    );
    process.exitCode = 1;
  }
}

async function start() {
  process.stdin.setRawMode(true);
  const mouse = createMouseInput(process.stdin);
  process.stdout.write(ENABLE_MOUSE);
  process.stdout.write(ENTER_ALT_SCREEN);
  try {
    const ui = render(
      <Terminal wheelEvents={mouse.events} />, {
        stdin: mouse.stdin,
        interactive: true,
        kittyKeyboard: { mode: 'auto' },
        maxFps: process.env.SSH_TTY === undefined ? 60 : 30,
      }
    );
    const stop = () => {
      ui.unmount();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.once('SIGHUP', stop);
    try {
      await ui.waitUntilExit();
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      process.off('SIGHUP', stop);
    }
  } finally {
    process.stdout.write(DISABLE_MOUSE);
    process.stdout.write(EXIT_ALT_SCREEN);
    mouse.dispose();
    process.stdin.setRawMode(false);
  }
}
