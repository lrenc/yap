import { afterEach, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { Scroller } from '../../../src/cli/components/scroller.tsx';

function lines(count: number) {
  return Array.from(
    { length: count },
    (_value, index) => `line ${index + 1}`,
  );
}

function view(
  items: readonly string[],
  wheelEvents?: EventEmitter,
) {
  return (
    <Box height={8} flexDirection='column'>
      <Scroller
        maxHeight={7}
        {...(wheelEvents === undefined ? {} : { wheelEvents })}
      >
        {items.map(item => (
          <Text key={item}>{item}</Text>
        ))}
      </Scroller>
      <Text>composer</Text>
    </Box>
  );
}

async function waitForStable(
  value: () => string | undefined,
): Promise<void> {
  let current = value();
  let changedAt = Date.now();
  while (Date.now() - changedAt < 40) {
    await new Promise(resolve => setTimeout(resolve, 5));
    const next = value();
    if (next !== current) {
      current = next;
      changedAt = Date.now();
    }
  }
}

describe('Scroller', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('leaves short content in its natural position', async () => {
    rendered = render(view(lines(3)));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame.indexOf('line 3')).toBeLessThan(
      frame.indexOf('composer'),
    );
    expect(frame.split('\n').findIndex(line => line === 'composer')).toBe(3);
  });

  test('keeps the footer fixed while scrolling a long transcript', async () => {
    rendered = render(view(lines(20)));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const initial = rendered.lastFrame() ?? '';
    expect(initial).toContain('line 20');
    expect(initial.split('\n')).toHaveLength(8);
    expect(initial.split('\n').at(-1)).toBe('composer');

    rendered.stdin.write('\x1b[5~');
    await new Promise(resolve => setTimeout(resolve, 0));

    const scrolled = rendered.lastFrame() ?? '';
    expect(scrolled).not.toContain('line 20');
    expect(scrolled.split('\n').at(-1)).toBe('composer');
  });

  test('follows new output until the reader scrolls away', async () => {
    rendered = render(view(lines(10)));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    rendered.rerender(view(lines(11)));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rendered.lastFrame()).toContain('line 11');

    rendered.stdin.write('\x1b[5~');
    await new Promise(resolve => setTimeout(resolve, 0));
    rendered.rerender(view(lines(12)));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rendered.lastFrame()).not.toContain('line 12');
  });

  test('scrolls the transcript with the mouse wheel', async () => {
    const wheelEvents = new EventEmitter();
    rendered = render(view(lines(20), wheelEvents));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    wheelEvents.emit('wheel', -1);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(rendered.lastFrame()).not.toContain('line 20');
    expect(rendered.lastFrame()?.split('\n').at(-1)).toBe('composer');
  });

  test('moves one row for a slow wheel turn and then stops', async () => {
    const wheelEvents = new EventEmitter();
    rendered = render(view(lines(40), wheelEvents));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rendered.lastFrame()).toContain('line 40');

    wheelEvents.emit('wheel', -1);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rendered.lastFrame()).not.toContain('line 40');
    expect(rendered.lastFrame()).toContain('line 39');

    await waitForStable(() => rendered?.lastFrame());
    expect(rendered.lastFrame()).not.toContain('line 40');
    expect(rendered.lastFrame()).toContain('line 39');
  });

  test('does not build a long scroll backlog after input stops', async () => {
    const wheelEvents = new EventEmitter();
    rendered = render(view(lines(40), wheelEvents));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    for (let count = 0; count < 20; count += 1) {
      wheelEvents.emit('wheel', -1);
    }
    await waitForStable(() => rendered?.lastFrame());
    const settledFrame = rendered.lastFrame();
    const settledCount = rendered.frames.length;

    await waitForStable(() => rendered?.lastFrame());
    expect(rendered.lastFrame()).toBe(settledFrame);
    expect(rendered.frames.length).toBe(settledCount);
    expect(rendered.lastFrame()).toContain('line 24');
    expect(rendered.lastFrame()).not.toContain('line 1\n');
  });

  test('does not scroll while inactive', async () => {
    const wheelEvents = new EventEmitter();
    rendered = render(
      <Box height={8} flexDirection='column'>
        <Scroller
          maxHeight={7}
          scrollActive={false}
          wheelEvents={wheelEvents}
        >
          {lines(20).map(line => <Text key={line}>{line}</Text>)}
        </Scroller>
        <Text>composer</Text>
      </Box>,
    );
    await waitForStable(() => rendered?.lastFrame());
    const before = rendered.lastFrame();

    rendered.stdin.write('\x1b[5~');
    wheelEvents.emit('wheel', -1);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(rendered.lastFrame()).toBe(before);
  });

  test('reports new output until the reader returns to the bottom', async () => {
    const changes: boolean[] = [];
    const tree = (items: readonly string[]) => (
      <Box height={8} flexDirection='column'>
        <Scroller
          maxHeight={7}
          onNewOutputChange={value => changes.push(value)}
        >
          {items.map(line => <Text key={line}>{line}</Text>)}
        </Scroller>
        <Text>composer</Text>
      </Box>
    );
    rendered = render(tree(lines(20)));
    await waitForStable(() => rendered?.lastFrame());

    rendered.stdin.write('\x1b[5~');
    await waitForStable(() => rendered?.lastFrame());
    rendered.rerender(tree(lines(21)));
    await waitForStable(() => rendered?.lastFrame());
    expect(changes.at(-1)).toBe(true);

    rendered.stdin.write('\x1b[1;5F');
    await waitForStable(() => rendered?.lastFrame());
    expect(changes.at(-1)).toBe(false);
  });

});
