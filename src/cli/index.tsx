import { render } from 'ink';
import { Terminal } from './terminal.tsx';

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
  // 清屏
  if (process.env.TERM !== 'dumb') {
    process.stdout.write('\x1b[2J\x1b[H\x1b[3J');
  }

  const ui = render(
    <Terminal />, {
      interactive: true,
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
}
